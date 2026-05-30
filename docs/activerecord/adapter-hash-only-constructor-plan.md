# Adapter hash-only constructor migration plan

**Status:** proposed (planning only — no code yet)
**Goal:** Align trails' concrete adapter constructors with Rails, which build an
adapter from a **configuration hash only**. Remove the trails-specific
URL/connection-string constructor convenience and route URL→hash resolution
through the existing config layer, the way Rails does.

## Why (the smell)

Rails' adapter `initialize` only ever receives a symbolized **config hash**
(`postgresql_adapter.rb:320`, `mysql2_adapter.rb`, `sqlite3_adapter.rb:102`).
URL / `DATABASE_URL` parsing happens **upstream** in
`ActiveRecord::DatabaseConfigurations` (`UrlConfig` / `ConnectionUrlResolver`)
before any adapter is constructed; the adapter never sees a URL string.

trails diverged: `PostgreSQLAdapter` / `Mysql2Adapter` constructors accept
`string | configHash`, and the `typeof config === "string"` branch does its own
URL parsing inside the adapter. That duplicate parsing is why review feedback
keeps surfacing "the message says config hash but a string can hit it too"
ambiguities (e.g. PR #2700's `ArgumentError` guard).

The string form is called from **~146 sites across ~80 files** — which is the
smell the migration addresses: call sites reach past the config layer and hand
the adapter a URL directly.

## Two tangled divergences (read before sizing Phase 2..N)

There are actually **two** ways trails' adapter constructors differ from Rails,
and they interact:

- **(a) URL-string acceptance.** Adapters accept `string | hash` and parse the
  URL internally. This plan's headline target.
- **(b) Driver-native hash vs Rails config hash.** Even the _hash_ path is
  **driver-native**: PG spreads `pg.PoolConfig` keys (`user`, `connectionString`,
  `port`, …) straight into the client; MySQL2 spreads `mysql.PoolOptions`
  (`user`, `uri`, …). Rails adapters instead receive a **Rails config hash**
  (`username`, `database`, `host`, `port`, `adapter`) and translate internally —
  PG `initialize` does `conn_params[:user] = delete(:username)`,
  `conn_params[:dbname] = delete(:database)`, then `slice!` to valid PG keys
  (`postgresql_adapter.rb:320-334`).

Why this matters: `ConnectionUrlResolver.toHash()` emits **Rails** keys
(`{ adapter, host, port, database, username, password }`). You **cannot** feed
that straight into trails' current hash path — `username`/`adapter` are not pg
`user`/valid keys, and MySQL2 would get `username` instead of `user`. So bridging
URL→hash forces a decision about (b):

- **Bridge-only (smaller):** Phase 1's helper maps resolver output → the existing
  driver-native shape (`username→user`, drop `adapter`, etc.). Adapters stay
  driver-native; only the URL string is removed. ~80 string sites migrate; the
  ~38 existing driver-native hash sites are untouched. "Mechanical" holds.
- **Full Rails fidelity (larger):** make the adapter hash path accept a **Rails
  config hash** and do the `username→user` / `database→dbname` translation
  internally (mirror Rails' `conn_params`). This is the real match — but it also
  changes every existing driver-native hash call site (~38) and the adapter
  `initialize` body, so Phase 2..N roughly doubles and stops being purely
  mechanical.

**Recommendation:** do bridge-only first (removes the URL smell, keeps deltas
small), and track full-fidelity (b) as an explicit follow-up plan. Decide before
Phase 1, because it dictates the helper's output shape.

### Caller breakdown — mostly tests, but NOT only

The overwhelming majority of string-form call sites are in `*.test.ts` or test
infrastructure. **However, there are real production callers** in the
`DatabaseTasks` layer that build a transient adapter from a config URL:

- `tasks/database-tasks.ts:1053` — `new PostgreSQLAdapter(String(c.url))`
- `tasks/database-tasks.ts:1065` — `new Mysql2Adapter(String(c.url))`
- `tasks/postgresql-database-tasks.ts:228, 274, 378` — `new PostgreSQLAdapter(String(c.url))` / `(parsed.toString())`
- `tasks/mysql-database-tasks.ts:349` — `new Mysql2Adapter(String(c.url))`

These run during `db:create` / `db:drop` / `db:purge` / structure tasks (an admin
connection built straight from `config.url`). So the migration is **not** purely
test-ergonomics: the production task callers MUST be migrated before the final
constructor deletion, or those rake-equivalent tasks break. They get their own
batch in Phase 2..N (below). Rails itself resolves these through
`db_config.configuration_hash`, never by re-parsing the URL at the task layer —
so migrating them is also the Rails-faithful direction.

(Prior drafts of this doc claimed "no production path"; that was an incomplete
search — corrected here.)

## Existing infra to reuse (don't reinvent)

- `database-configurations/connection-url-resolver.ts` — `new
ConnectionUrlResolver(url).toHash()` already produces a Rails-faithful
  `DatabaseConfigOptions` hash (compact_blank + URI-decode). This is the exact
  URL→hash converter the adapters should NOT be duplicating.
- `database-configurations/url-config.ts` — Rails' `UrlConfig` equivalent.
- `test-adapter.ts` — the canonical test factory **already** constructs PG/MySQL2
  from hashes (`new PostgreSQLAdapter({ ... })`, lines ~99/112). The Rails-aligned
  pattern already exists; most test files simply bypass it for the URL shorthand.

## Target state

1. `PostgreSQLAdapter` / `Mysql2Adapter` constructors accept **only** a config
   hash (plus the deprecated raw-connection overload from #2700). Delete the
   `typeof config === "string"` branches and their in-adapter URL parsing.
2. URL strings are converted to a hash by the caller via the config layer
   (`ConnectionUrlResolver(url).toHash()`), never inside the adapter.
3. Tests obtain adapters through a single helper that owns the URL→hash step,
   so the conversion lives in one place (see Phase 1).
4. (Stretch) `SQLite3Adapter` — see "SQLite sub-divergence" below.

## Migration phases (each a PR off `main`, ≤300 LOC, non-overlapping files)

### Phase 0 — Land #2700 first

#2700 edits the PG/MySQL2 constructors (raw-connection overload). This migration
also edits those constructors, so it MUST follow #2700 to avoid file-overlap
conflicts. Do not start Phase 1 until #2700 merges; rebase onto updated `main`.

### Phase 1 — Introduce the URL→hash test helper (additive, no removals)

- Add a helper (e.g. `adapterConfigFromUrl(url)` → hash via
  `ConnectionUrlResolver.toHash()`, or a thin `testAdapterForUrl(url)` factory)
  in `test-adapter.ts` / per-adapter `test-helper.ts`.
- No call-site changes yet; no constructor changes. Pure addition + unit test.
- ~40–60 LOC. Unblocks the mechanical migration.

### Phase 2..N — Migrate call sites in batches (assumes bridge-only)

This is the bulk of the work and the part most worth scoping carefully. It is
"mechanical" **only under the bridge-only decision** above (helper emits the
driver-native shape the adapters already accept). The call sites are not all the
same shape — there are four distinct patterns, each with its own transform:

| Pattern (approx count)                                                   | Transform                                                 |
| ------------------------------------------------------------------------ | --------------------------------------------------------- |
| `new XAdapter(PG_TEST_URL)` / `(MYSQL_TEST_URL)` (~85)                   | → `new XAdapter(testAdapterConfig(PG_TEST_URL))` (helper) |
| literal URL `new XAdapter("postgres://…")` (~10)                         | → wrap the literal in the helper                          |
| computed URL `String(c.url)`, `url.toString()`, `postgresUrl(...)` (~10) | → wrap the computed string in the helper                  |
| already-hash `{ uri: … }` / `{ connectionString: … }` (~20)              | leave as-is (driver-native), or normalize for consistency |

Batch **by directory** so each PR stays ≤300 LOC and non-overlapping with
sibling agents (avoids the rebase-chain hazard):

1. **Production `DatabaseTasks` callers** (`tasks/database-tasks.ts`,
   `tasks/postgresql-database-tasks.ts`, `tasks/mysql-database-tasks.ts`) — the
   non-test sites that pass `String(c.url)`. **This batch is mandatory and must
   precede Phase final**, or `db:create`/`db:drop`/structure tasks break.
   Resolve `c.url` → hash via the config layer (these already have a
   `DatabaseConfig`, so prefer `configuration_hash` over re-parsing). Has its own
   tests; verify them.
2. PG adapter tests (`adapters/postgresql/**`)
3. MySQL adapter tests (`adapters/abstract-mysql-adapter/**`, `adapters/mysql2/**`)
4. top-level `src/*.test.ts` (dirty, transactions, transaction-isolation, …)
5. test-infra (`test-helpers/**`, `test-setup-worker-db.ts`) — do this batch
   last within Phase 2..N: a bug here fails many suites at once.

~80 files total; expect ~4–6 batch PRs. **Phase final is blocked until batch 1
(production callers) lands** — that's the one batch whose omission causes a
runtime regression, not just red tests.

**Why it is NOT pure find-and-replace, even bridge-only:**

- **Per-call assertions on URL-derived state.** Some sites build the adapter then
  assert on `_database`, `wait_timeout`, etc. that the in-adapter URL parser
  populated. The resolver covers host/db/port, but MySQL's `wait_timeout`
  stripping and the `_database` URI fallback currently live in the adapter's
  string branch — port them into the helper or they regress.
- **`MYSQL_TEST_URL` carries query params** (`?wait_timeout=…`) in some suites;
  the helper must preserve/thread them.
- **`describeIf*` gating** is unaffected — only the construction call changes.
- Run the touched test files per batch (`pnpm vitest run <files>`); do **not**
  run the whole suite (CLAUDE.md).

Under full-fidelity (b) instead, Phase 2..N also rewrites the ~38 existing
driver-native hash sites to Rails keys and changes the adapter `initialize`
body — see "Two tangled divergences."

### Phase final — Remove the string branch from the constructors

- Once NO call site passes a string, delete the `typeof config === "string"`
  branches + in-adapter URL parsing from PG/MySQL2.
- Narrow the constructor type to `configHash` (+ raw-connection overload).
- Simplifies the #2700 `ArgumentError` guard wording (no string path to be
  "misleading" about).
- ~60–100 LOC net deletion + constructor type tightening. Must be last.

## SQLite sub-divergence (decide separately)

`SQLite3Adapter` takes `(filename: string, options)` — also unlike Rails, which
takes a hash with a `database:` key (`sqlite3_adapter.rb:106-129`). Aligning it
is a parallel effort (filename positional → `{ database }` hash) touching its own
large set of `new SQLite3Adapter(":memory:")` call sites. Recommend treating as a
**separate plan** after PG/MySQL2 land, to avoid an oversized blast radius. Flag
for explicit go/no-go.

## Risks / open questions

- **Blast radius vs. value.** Mostly test-ergonomics, but with a handful of real
  production `DatabaseTasks` callers (see "Caller breakdown") — so the final
  constructor deletion carries genuine runtime risk if batch 1 is skipped. The
  payoff is API fidelity + removing duplicate URL parsing. Worth confirming the
  cost is justified pre-release (it is the right time if ever).
- **Helper shape.** `adapterConfigFromUrl(url): hash` (caller still `new`s the
  adapter) vs. `testAdapterForUrl(url): adapter` (helper owns construction).
  Former is more explicit/Rails-like; latter is terser. Lean toward the former.
- **Driver-specific keys.** PG `connectionString` and MySQL `uri` are real driver
  options; `ConnectionUrlResolver.toHash()` emits Rails keys (host/database/…),
  not driver-native ones. Verify the resolver output drives both drivers
  correctly, or have the helper map to driver-native config. This is the one
  genuinely non-mechanical risk — validate in Phase 1.
- **test:compare / api:compare.** Deleting the string branch removes no public
  Rails-mapped method (the branch isn't a counted method); deltas should stay
  ≥0. Confirm per PR.

## Sequencing summary

```
#2700 (raw-conn overload)  →  Phase 1 (helper)  →  Phase 2..N (call sites)  →  Phase final (delete string branch)
                                                                                 (SQLite: separate plan, optional)
```
