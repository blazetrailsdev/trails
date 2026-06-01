# Adapter / connection architecture cleanup (consolidated)

> **Snapshot 2026-06-01.** Consolidates three related adapter-layer
> initiatives that all converge on the same end state — adapters owned by the
> connection/pool layer, no process-global dialect state, Rails-faithful
> construction. Phase ordering lives in
> [`activerecord-index.md`](activerecord-index.md).
>
> History: `git log --follow -- docs/activerecord/<old-doc>.md` for
> `adapter-cleanup-plan.md`, `remove-global-arel-visitor-plan.md`,
> `adapter-hash-only-constructor-plan.md`, `this-adapter-non-test-audit.md`
> (all merged here and deleted).

## The three initiatives

| #   | Initiative                     | Status                                     | Blocker                                                     |
| --- | ------------------------------ | ------------------------------------------ | ----------------------------------------------------------- |
| 1   | Adapter → Connection collapse  | Phases 1–2 shipped; PR A/B/C remain        | PR A gated on Phase G barrel-import clearance; B/C any-time |
| 2   | Remove the global Arel visitor | Investigation complete; Phases A–C planned | Unblocked — actionable now                                  |
| 3   | Adapter hash-only constructor  | Proposed (no code)                         | Phase 0 gated on #2700                                      |

## `this.adapter = …` non-test audit (reference)

The non-`*.test.ts` `this.adapter = …` survey concluded: **27 bypass-survivor
sites** remain, both in fixture _builders_ (not test files, so the test-file
sweep does not reach them) — **8 in `adapters/postgresql/schema-ar-models.ts`**
and **19 in `encryption/test-helpers.ts`**. Each needs a sized follow-up PR to
migrate its factory-built `Base` subclasses off `this.adapter = adapter` onto
the `Base.connection` handler chain (the `bootstrapTestHandler` pattern). The
other four files (`type/adapter-specific-registry.ts`,
`test-helpers/bootstrap-test-handler.ts`, `migrator.ts`,
`connection-adapters/abstract/schema-creation.ts`) are legitimate bound-adapter
fields on non-`Base` abstractions and are **permanently excluded** from future
`this.adapter` bypass audits.

---

## Adapter → Connection Collapse Plan

Phases 1–2 are complete. This document tracks the remaining cleanup.

### Shipped

| PR  | Title                                                                                         |
| --- | --------------------------------------------------------------------------------------------- |
| 1a  | #2395 — move arel-visitor wiring to `AbstractAdapter`, remove per-class caching               |
| 1b  | #2401 — migrate `.adapter` call-sites to `.connection`                                        |
| 2a  | #2402 — widen `AbstractAdapter` to superset `DatabaseAdapter`                                 |
| 2b  | #2404 — relocate `adapter.ts` survivors to Rails-natural homes                                |
| —   | #2411 — addIndex return type, `migration-runner.ts` → `migrator.ts`, `InsertAll` shim removal |

Result: `Base.adapter` getter and `_adapter` field deleted. All source call sites use `Base.connection` (pool-based). `DatabaseAdapter` widened to superset `AbstractAdapter` and survivors relocated. A `static get adapter()` compatibility alias bridges ~7000 test sites until Phase G clears them.

### Remaining work

#### PR A — Delete `adapter.ts` barrel + `DatabaseAdapter` interface (~150 LOC, bundled)

**Depends on:** Phase G fixture adoption progressing far enough that the ~134 import sites still re-exporting through `adapter.ts` have been rewritten. (Phase G replaces inline `Model.create()` with `useFixtures()` and rewrites `.adapter` → `.connection` in the same pass.)

**Scope:**

- Delete `packages/activerecord/src/adapter.ts`.
- Delete the `DatabaseAdapter` interface entirely — `AbstractAdapter` is the superset per #2402.
- Update `index.ts` re-exports.
- Verify with `grep -rn "from .*['\"]\\./adapter['\"]" packages/activerecord/src/` returning zero non-test hits.

Cross-reference: `docs/activerecord/fixtures-adoption-plan.md` for Phase G sequencing.

#### PR B — `schema-ar-models.ts` `set connection()` cleanup (~small)

**Status:** previously blocked on the `set connection()` rename in PR 1a (now landed); re-check whether the cleanup is still needed.

**Scope:**

- Audit `packages/activerecord/src/schema-ar-models.ts` for any remaining `set adapter()` usage.
- Update to `set connection()` if any callers remain.
- If audit shows zero references, close this item as moot.

#### PR C — Per-adapter Arel visitor — partially shipped (#2432)

**Status:** #2432 shipped per-adapter cached visitor on `AbstractAdapter`. The global `setToSqlVisitor` sync mechanism remains as backwards compat for ~35 `Node#toSql()` / `TreeManager#toSql()` call sites that lack adapter context.

**Remaining (~150-200 LOC):**

- Migrate ~35 `toSql()` call sites to `connection.visitor.compile(ast)`. Largest clusters: `relation.ts` (~15 sites), `schema-migration.ts` (6), `internal-metadata.ts` (6), `persistence.ts` (5), `locking/pessimistic.ts` (1).
- Once all call sites are migrated, delete the global `setToSqlVisitor` mechanism.

#### Long-tail (separate initiative) — Delete `set connection()` + `get adapter()` compat alias

**Out of scope for this plan.** Requires converting ~6900 test sites from `this.adapter = adapter` (a trails-ism in `static {}` blocks) to `establishConnection()` (Rails idiom). The compat alias is consumed by Phase G; the setter removal lands once Phase G is done.

Tracked here for visibility only — open a separate plan when ready.

### Ordering

```
PR A (delete adapter.ts + DatabaseAdapter) ── after Phase G clears barrel imports
PR B (schema-ar-models.ts audit) ── any time
PR C (per-adapter visitor) ── any time, low priority
```

PR B and PR C are independent of each other and of PR A. All branch from `main` (no stacking).

### Post-merge follow-ups

Items surfaced during PRs that land adjacent to this plan. Add to the
appropriate Phase above once ready to schedule; listed here to avoid loss.

**From #2402 (PG addIndex cleanup)**

- [x] ~5 LOC: `addIndex` return type inconsistency on PG adapter — fix return type annotation to match AbstractAdapter.

**From #2401 (set connection() rename)**

- [x] ~16 LOC: rename `migration-runner.ts` → `migrator.ts` to match Rails-natural file layout.
- [ ] ~schema-ar-models.ts: `set connection()` setter in schema-ar-models.ts is blocked on the `set connection()` rename in Phase 1a landing first.
- Discovery: `extend()` overwrites class getters — any future getter that must survive `extend()` needs a post-extend `Object.defineProperty` call. Document this in contributor notes if/when it re-surfaces.

**From #2395 (InsertAll / visitor)**

- [x] ~20 LOC: collapse `InsertAll` constructor overloads to single Rails-canonical `(relation, connection, inserts, options)` signature.
- [ ] Pre-existing: global visitor singleton (`setToSqlVisitor`) vs per-adapter visitor — Rails uses per-adapter. Low-risk now, but flagged for the Phase 2 cleanup window.

**From #2386 (PR 1b first batch)**

- Remaining PR 1b sites not yet migrated: `associations/preloader/association.ts`, `relation/query-methods.ts`, `validations/uniqueness.ts`, `attribute-methods/primary-key.ts`. These are the Phase 1b remainder; tracked here until Phase 1b lands.

**From #2392 (QueryMethods double-fallback removal)**

- No new follow-ups; confirms Phase 1b pattern is safe.

**From #2404 (relocate adapter.ts survivors)**

- [ ] Phase G: delete `adapter.ts` barrel — 134 import sites still re-export through it. Phase G fixture adoption rewrites all imports. No standalone PR needed.
- [ ] ~150 LOC: delete `DatabaseAdapter` interface entirely once barrel is gone — `AbstractAdapter` is the superset per #2402. ~134 files.

### Non-goals (this plan)

- **Deleting `set connection()` and the `get adapter()` compat alias** — see "Long-tail" above.
- Renaming `connection-adapters/` directory or `AbstractAdapter` class (those already match Rails).
- `withConnection { }` block semantics (future pool lifecycle work).
- `connectedTo()` role-switching API (separate initiative).

---

## Remove the global Arel visitor — route `toSql` through `connection.visitor`

**Status:** Investigation complete; plan below. Supersedes PR 0
(visitor-on-establish, #2600) of the bootstrap→DatabaseTasks migration.

**Goal:** Stop ActiveRecord from depending on — and "syncing" — a process-global
Arel visitor. Route every production `toSql` call through the connection's
visitor (`connection.toSql(node)`), exactly as Rails does. This makes the
per-file `beforeEach syncHandlerVisitor` dance (which the bootstrap→DatabaseTasks
migration is trying to kill) unnecessary, because there is no global dialect
state left to re-sync.

### Why (verified against `vendor/rails`)

Rails has **no process-global Arel visitor**. Each adapter owns its visitor
(`abstract_adapter.rb:155` `@visitor = arel_visitor`, where `arel_visitor` →
`Arel::Visitors::ToSql.new(self)` at 1190), and all SQL compiles through that
connection-bound visitor:

- `connection.to_sql(arel)` (`database_statements.rb:12`) → extracts `.ast`,
  compiles via the connection's visitor.
- `relation.to_sql` (`relation.rb:1210`) → routes through the connection.

trails already mirrors this: `database-statements.ts:147` exports `toSql(arel)`
(extracts `.ast`, `this.visitor.compile(node)`), mixed into every adapter via
`include(AbstractAdapter, DatabaseStatements)` (`abstract-adapter.ts:1878`).
So `connection.toSql(node)` is the faithful analog of Rails'
`DatabaseStatements#to_sql` and is **already available on every adapter**.

What trails added on top — and Rails does **not** have — is a process-global
fallback: `Node#toSql()` / `TreeManager#toSql()` compile via a module-level
registry visitor (`arel/src/nodes/node.ts:34`,
`new _registry.ToSql!().compile(this)`), settable via `setToSqlVisitor`. AR
then _injects a dialect visitor into that global_ so adapter-less `.toSql()`
calls produce dialect-correct SQL:

- `base.ts:978` — the `Base.adapter =` setter syncs it.
- `bootstrap-test-handler.ts:45` `syncHandlerVisitor()` — re-syncs it.
- `test-setup.ts:10` — resets it to default `ToSql` after every test.
- (#2600 proposed adding install-on-establish — **the wrong direction**.)

The per-file `beforeEach syncHandlerVisitor` exists **only** because
`test-setup.ts` keeps resetting this global. Remove AR's dependence on the
global and the entire dance evaporates.

### Key finding: every production caller has a connection in scope

74 production (non-test) `.toSql()` calls in `packages/activerecord/src`. They
split into two shapes, and **every sampled caller already has a connection or
adapter in scope**:

- ~7 already do the defensive ternary
  `adapter.toSql ? adapter.toSql(x) : x.toSql()` (e.g. `persistence.ts:218/254/281`,
  `timestamp.ts:111`, `calculations.ts:224`). These prove the intended path is
  `connection.toSql`; the `: x.toSql()` fallback is the global leak to delete.
- The rest call `.toSql()` directly but hold a connection/adapter right there:
  - `schema-migration.ts` — `this._adapter.executeMutation(im.toSql())`
  - `internal-metadata.ts` — `this._connection.execute(sm.toSql())`
  - `migration.ts:1921` — `this.connection.executeMutation(td.toSql())`
  - `insert-all.ts:133` — `this.connection.executeMutation(builder.toSql())`
  - `statement-cache.ts:214` — has a `connection` param
  - `relation/calculations.ts:261/297` — `rel._modelClass.connection` (used two
    lines later for `selectAll`)
  - `base.ts:2586/2731/2779` — `ctor.connection` (already partly ternary'd)

This matters for **correctness**, not just parity: the default `ToSql` visitor
quotes identifiers with double-quotes, so a bare `.toSql()` on MySQL emits the
wrong quoting unless the global was synced to `MySQL`. Routing through
`connection.toSql` fixes the SQL _and_ removes the reason the global exists.

### What stays

`setToSqlVisitor` and the registry default (`ToSql`) **stay in the arel
package** — arel is a standalone, dialect-agnostic library; its own
`Node#toSql()` default is legitimate and its tests rely on it. What we remove
is **ActiveRecord injecting a dialect into that global** and depending on it.
arel keeps a single, never-mutated default.

### Plan (off `main`, ≤500 LOC each, non-overlapping files)

**Phase A — route production callers through `connection.toSql`.** Replace
`node.toSql()` with `connection.toSql(node)` (drop the `: x.toSql()` fallback)
everywhere a connection is in scope. Sized by cluster:

- A1: `schema-migration.ts` + `internal-metadata.ts` + `migration.ts` (DDL/metadata)
- A2: `persistence.ts` + `base.ts` (the ternary sites → unconditional)
- A3: `relation/calculations.ts` + `statement-cache.ts` + `insert-all.ts`
- A4: sweep the remaining direct `.toSql()` callers surfaced by grep

Each PR: change the calls, assert via existing tests that dialect SQL is
unchanged (the global was already being synced to the right dialect in tests,
so output should match — but now it's connection-derived).

**Phase B — drop AR's global-sync sites.** Once no production caller depends
on the global: delete the `setToSqlVisitor` call in the `Base.adapter =` setter
(`base.ts:978`), and stop `test-setup.ts` resetting it (the reset becomes a
no-op once nothing syncs it). Verify no production path regresses.

**Phase C — collapse into the bootstrap→DatabaseTasks migration.** With the
global no longer dialect-synced, `bootstrap-test-handler.ts`'s
`syncHandlerVisitor` and `setupHandlerSuite()`'s `beforeEach` are dead. Delete
them as part of that migration's PR 2/3. **This replaces the old "PR 0
visitor-on-establish."**

### Disposition of #2600 (PR 0, visitor-on-establish)

**Close it.** It made the non-Rails global shim more elaborate
(install-on-establish + restore-on-afterEach + a new `arel-visitor-sync.ts`
class with no Rails analog). Under this plan the global is removed, not grown,
so #2600 moves the wrong way. The bootstrap→DatabaseTasks plan's "PR 0" /
"Visitor sync: fold into establishConnection" decision is **superseded** by
this doc.

### Risks / open questions

- **Adapter-less callers that turn out to have no connection.** The grep
  sample all had one; Phase A4's sweep must confirm the long tail. Any genuine
  adapter-less site stays on the arel default `ToSql` (acceptable: it's a
  dialect-agnostic context by definition).
- **Test files that call bare `.toSql()`** and rely on the synced dialect.
  These are test-only; they either move to `connection.toSql` or accept the
  default `ToSql` output. Counted during Phase B.
- **Sequencing vs the bootstrap→DatabaseTasks migration.** Phase A/B are
  independent of that migration and can land first; Phase C is where they
  merge. The migration's other PRs (schema-file generator, test config) are
  unaffected and can proceed in parallel.

---

## Adapter hash-only constructor migration plan

**Status:** proposed (planning only — no code yet)
**Goal:** Align trails' concrete adapter constructors with Rails, which build an
adapter from a **configuration hash only**. Remove the trails-specific
URL/connection-string constructor convenience and route URL→hash resolution
through the existing config layer, the way Rails does.

### Why (the smell)

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

### Two tangled divergences (read before sizing Phase 2..N)

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

#### Caller breakdown — mostly tests, but NOT only

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

### Existing infra to reuse (don't reinvent)

- `database-configurations/connection-url-resolver.ts` — `new
ConnectionUrlResolver(url).toHash()` already produces a Rails-faithful
  `DatabaseConfigOptions` hash (compact_blank + URI-decode). This is the exact
  URL→hash converter the adapters should NOT be duplicating.
- `database-configurations/url-config.ts` — Rails' `UrlConfig` equivalent.
- `test-adapter.ts` — the canonical test factory **already** constructs PG/MySQL2
  from hashes (`new PostgreSQLAdapter({ ... })`, lines ~99/112). The Rails-aligned
  pattern already exists; most test files simply bypass it for the URL shorthand.

### Target state

1. `PostgreSQLAdapter` / `Mysql2Adapter` constructors accept **only** a config
   hash (plus the deprecated raw-connection overload from #2700). Delete the
   `typeof config === "string"` branches and their in-adapter URL parsing.
2. URL strings are converted to a hash by the caller via the config layer
   (`ConnectionUrlResolver(url).toHash()`), never inside the adapter.
3. Tests obtain adapters through a single helper that owns the URL→hash step,
   so the conversion lives in one place (see Phase 1).
4. (Stretch) `SQLite3Adapter` — see "SQLite sub-divergence" below.

### Migration phases (each a PR off `main`, ≤500 LOC, non-overlapping files)

#### Phase 0 — Land #2700 first

#2700 edits the PG/MySQL2 constructors (raw-connection overload). This migration
also edits those constructors, so it MUST follow #2700 to avoid file-overlap
conflicts. Do not start Phase 1 until #2700 merges; rebase onto updated `main`.

#### Phase 1 — Introduce the URL→hash test helper (additive, no removals)

- Add a helper (e.g. `adapterConfigFromUrl(url)` → hash via
  `ConnectionUrlResolver.toHash()`, or a thin `testAdapterForUrl(url)` factory)
  in `test-adapter.ts` / per-adapter `test-helper.ts`.
- No call-site changes yet; no constructor changes. Pure addition + unit test.
- ~40–60 LOC. Unblocks the mechanical migration.

#### Phase 2..N — Migrate call sites in batches (assumes bridge-only)

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

Batch **by directory** so each PR stays ≤500 LOC and non-overlapping with
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

#### Phase final — Remove the string branch from the constructors

- Once NO call site passes a string, delete the `typeof config === "string"`
  branches + in-adapter URL parsing from PG/MySQL2.
- Narrow the constructor type to `configHash` (+ raw-connection overload).
- Simplifies the #2700 `ArgumentError` guard wording (no string path to be
  "misleading" about).
- ~60–100 LOC net deletion + constructor type tightening. Must be last.

### SQLite sub-divergence (decide separately)

`SQLite3Adapter` takes `(filename: string, options)` — also unlike Rails, which
takes a hash with a `database:` key (`sqlite3_adapter.rb:106-129`). Aligning it
is a parallel effort (filename positional → `{ database }` hash) touching its own
large set of `new SQLite3Adapter(":memory:")` call sites. Recommend treating as a
**separate plan** after PG/MySQL2 land, to avoid an oversized blast radius. Flag
for explicit go/no-go.

### Risks / open questions

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

### Sequencing summary

```
#2700 (raw-conn overload)  →  Phase 1 (helper)  →  Phase 2..N (call sites)  →  Phase final (delete string branch)
                                                                                 (SQLite: separate plan, optional)
```

---
