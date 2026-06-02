# QueryLogs — True Rails Parity Plan

## Goal

Make `ActiveRecord::QueryLogs` a real query transformer in trails: wired into
the actual SQL-execution path so that **real model queries emit the comment**,
backed by an `assertQueriesMatch` test helper, with
`packages/activerecord/src/query-logs.test.ts` rewritten to mirror the Rails
counterpart verbatim and the two skipped connection tests unskipped.

Today the `QueryLogs` class is fully implemented and unit-tested, but it is
**never invoked by the query pipeline**. The TS test exercises it as a pure
unit (`logs.call("SELECT 1")`); the Rails test drives it through real queries
(`Dashboard.first`, `connection.execute "SELECT 1"`) and asserts the appended
comment via `assert_queries_match`. Two tests are `it.skip` for exactly this
reason (`query-logs.test.ts:104,110` — `connection is passed to tagging proc`,
`connection does not override already existing connection in context`).

**Motivation (re-anchored post-#2790).** An earlier draft of this plan framed
the goal as "drop `query-logs.test.ts` from
`eslint/test-fixture-parity-exclude.json`." That premise is **stale**: PR #2790
made the fixture-parity map precision-only and shrank the exclude baseline
33→7. As of `main`, `query-logs.test.ts` is **not** on the exclude list and
**not** in `eslint/test-fixture-parity.json`, and the rule passes clean on it
(its active tests call `logs.call("SELECT 1")`, never a `dashboards(...)` row
accessor). So there is no exclude-list step to perform. The real, still-true
goals are: **(a) wire QueryLogs into the query pipeline so real model queries
emit the comment, and (b) unskip the two connection tests** — a net test:compare
gain. Note PR 5's rewrite to `useHandlerFixtures(["dashboards"])` +
`dashboards(...)` accessors satisfies the parity rule by construction, so the
file neither needs nor gains an exclude-list entry at any point.

This is **feature work, not a fixture swap** — see the ordering finding in
[Key architectural finding](#key-architectural-finding-instrumentation-ordering).

## Current state (what exists vs. what's missing)

| Piece                                                                      | Status                                                                           | Location                                                       |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `QueryLogs` class (tags, formatters, cache, `call(sql)`, `comment()`)      | ✅ Implemented + unit-tested                                                     | `src/query-logs.ts`, `src/query-logs-formatter.ts`             |
| `LegacyFormatter` / `SQLCommenter`                                         | ✅ Implemented                                                                   | `src/query-logs-formatter.ts`                                  |
| `ExecutionContext` (`set`, `setKey`, `toH`, `clear`)                       | ✅ Implemented                                                                   | `activesupport/src/execution-context.ts`                       |
| `preprocessQuery(sql)` adapter hook                                        | ⚠️ Exists but **no transformer loop** — only write-checks, returns sql unchanged | `src/connection-adapters/abstract/database-statements.ts:1648` |
| `internalExecute` → `preprocessQuery` → `rawExecute` chain                 | ✅ Wired                                                                         | `database-statements.ts:1660`                                  |
| Global `ActiveRecord.queryTransformers` registry                           | ❌ Missing                                                                       | —                                                              |
| `QueryLogs` singleton + registration into the registry                     | ❌ Missing — class exported from `index.ts` but never instantiated               | `src/index.ts:178`                                             |
| `context[:connection]` injection + `call(sql, connection)` 2-arg signature | ❌ Missing — our `call(sql)` takes one arg                                       | `src/query-logs.ts:167`                                        |
| `ExecutionContext.afterChange` cache-clear hook                            | ❌ Missing                                                                       | `activesupport/src/execution-context.ts`                       |
| `assertQueriesMatch` / `SQLCounter` test helper                            | ❌ Missing                                                                       | —                                                              |
| `sql.active_record` notification carries the **commented** SQL             | ❌ **No** — fires pre-transform (see below)                                      | `database-statements.ts:1271`                                  |

## Rails reference

```ruby
# abstract/database_statements.rb
def preprocess_query(sql)
  check_if_write_query(sql)
  mark_transaction_written_if_write(sql)
  ActiveRecord.query_transformers.each { |t| sql = t.call(sql, self) }   # ← the loop we lack
  sql
end

def raw_execute(sql, name = nil, ...)   # ← `log { ... }` lives HERE, with commented sql
  log(sql, name, ...) { ... }
end

def internal_execute(sql, ...)
  sql = preprocess_query(sql)            # ← transform BEFORE raw_execute/log
  raw_execute(sql, name, binds, ...)
end
```

```ruby
# query_logs.rb
def call(sql, connection)
  comment = self.comment(connection)
  return sql if comment.blank?
  prepend_comment ? "#{comment} #{sql}" : "#{sql} #{comment}"
end

def comment(connection)
  comment = uncached_or_cached_comment(connection)   # threads connection down
  ...
end

def tag_content(connection)                       # ← connection injected HERE
  context = ActiveSupport::ExecutionContext.to_h
  context[:connection] ||= connection             # ← the two skipped tests need this
  ...
end

ActiveSupport::ExecutionContext.after_change { ActiveRecord::QueryLogs.clear_cache }
```

`assert_queries_match` subscribes a `SQLCounter` to `sql.active_record` and
matches the payload `:sql` against a regex. It sees the comment **because in
Rails `log` runs inside `raw_execute`, after `preprocess_query`.**

## Key architectural finding (instrumentation ordering)

In trails the order is **inverted** relative to Rails:

```
internalExecQuery(sql)                       database-statements.ts:1264
  └─ logSql(this, sql, ...)   ← fires `sql.active_record` with the ORIGINAL sql
       └─ internalExecute(sql)               :1276
            └─ preprocessQuery(sql)          ← transform happens HERE, too late
                 └─ rawExecute(processed)
```

`logSql` wraps execution with the **pre-transform** SQL, so even after we add
the transformer loop to `preprocessQuery`, the `sql.active_record` payload —
and therefore any `assertQueriesMatch` helper — would **not** see the comment.

To match Rails we must instrument the **post-preprocess** SQL. Two options:

- **Option A (Rails-faithful): move `log`/instrumentation into `rawExecute`.**
  This is exactly where Rails' `log` block lives (`raw_execute`,
  `database_statements.rb:552-559`), with `preprocess_query` run before it in
  `internal_execute`. Highest fidelity; ripples across every concrete adapter's
  `rawExecute`/instrumentation and every test that asserts on `sql.active_record`
  payloads — larger blast radius.
- **Option B (minimal): preprocess before instrumenting.** Hoist
  `preprocessQuery` so `logSql` receives the already-transformed SQL — e.g.
  `internalExecQuery` calls `preprocessQuery` and passes the processed SQL to
  `logSql`, with `internalExecute` not re-preprocessing. Smaller diff,
  preserves the comment in the payload.

**This is a Rails-fidelity trade-off, not just a blast-radius call — it
requires the user's explicit sign-off.** Per CLAUDE.md, "deviation from Rails is
almost always wrong; matching Rails is almost always right," so **Option A is
the default recommendation**: it reproduces Rails' execution layout
(`internal_execute → preprocess_query → raw_execute(log)`) faithfully.

**What Option B diverges on, concretely:** Rails applies transformers inside
`internal_execute` and logs inside `raw_execute`, so the transform attaches at
the adapter boundary and _every_ path into `raw_execute` (including
`execute_batch`, which calls `raw_execute` per statement) gets the comment. The
proposed B reorder attaches the transform one level up in `internalExecQuery`,
so any execution path that reaches `rawExecute`/`internalExecute` **without**
going through `internalExecQuery` would silently skip the comment. Before
choosing B, enumerate those paths and confirm none of the QueryLogs-relevant
ones (`Dashboard.first`, `connection.execute`, `exists?`, `destroy`, `save`,
`create`, `all.to_a` — the exact Rails test surface) are missed. If any are,
Option A is required.

This ordering subtlety — not the `QueryLogs` class itself — is the real work
and the reason a "just add `useHandlerFixtures`" migration is impossible.

## Implementation plan (PR-sized, each branched from `main`, non-overlapping files)

Per CLAUDE.md: no stacked PRs, ≤300 LOC each (this file targets ≤300),
sibling branches off `main` with non-overlapping files, merged sequentially.

### PR 1 — `queryTransformers` registry + `QueryLogs` 2-arg `call` + connection context

- Add a global mutable `queryTransformers: QueryTransformer[]` registry
  (mirrors `ActiveRecord.query_transformers`) with a typed
  `QueryTransformer = { call(sql: string, connection: unknown): string }`.
- Extend `QueryLogs.call` to the Rails 2-arg shape `call(sql, connection?)`;
  thread `connection` through `comment()` → `tagContent()` and inject
  `context.connection ||= connection` in **`tagContent()`** (mirroring Rails'
  `tag_content(connection)`, query_logs.rb) so the two
  currently-skipped tests (`connection is passed to tagging proc`,
  `connection does not override already existing connection in context`)
  have their dependency satisfied. Keep `call(sql)` working (connection
  optional) for the existing unit tests.
- **Files:** `src/query-logs.ts`, `src/query-transformers.ts` (new),
  `src/index.ts` (export), plus unit tests. No adapter edits.
- **Smoke test only** here; full integration proof lands in PR 3.

### PR 2 — `ExecutionContext.afterChange` → `QueryLogs.clearCache`

- Add an `afterChange(fn)` subscription to `ExecutionContext` in activesupport
  and fire subscribers from `set`/`setKey`/`clear`.
- Register `QueryLogs.clearCache` so cached comments invalidate on context
  change (mirrors `query_logs.rb` `after_change`).
- **Files:** `activesupport/src/execution-context.ts` (+ test). Cross-package,
  but isolated — no overlap with PR 1/3.

### PR 3 — Wire transformers into `preprocessQuery` + fix instrumentation ordering

- Add the transformer loop to `preprocessQuery`:
  `for (const t of queryTransformers) sql = t.call(sql, this);`
- Apply the instrumentation reorder so the `sql.active_record` payload carries
  the post-preprocess (commented) SQL. **Use the Option A vs. B decision locked
  with the user** (default: Option A — instrument inside `rawExecute`, Rails-
  faithful). Whichever is chosen, preprocess exactly once per query.
- **Files:** Option A touches `src/connection-adapters/abstract/database-statements.ts`
  **and concrete adapters' `rawExecute`/instrumentation** (larger); Option B
  touches `database-statements.ts` only. This is the load-bearing PR — guard
  against double-preprocessing and verify no existing `sql.active_record`
  assertions regress.

### PR 4 — `assertQueriesMatch` test helper (`SQLCounter`)

- Port Rails' `SQLCounter` + `assertQueriesMatch(match, { count? })`:
  subscribe to `sql.active_record`, collect non-SCHEMA queries, assert ≥1 (or
  exact `count`) match a regex/string.
- **Files:** `src/test-helpers/assert-queries-match.ts` (+ test). Pure
  addition, no overlap.

### PR 5 — Migrate `query-logs.test.ts` to Rails parity + unskip connection tests

- Rewrite the query-driving tests to drive real queries through the
  canonical `Dashboard` model (`src/test-helpers/models/dashboard.ts`) +
  `useHandlerFixtures(["dashboards"])`, asserting the comment via
  `assertQueriesMatch` — mirroring `query_logs_test.rb` verbatim (test names,
  `application:active_record` tagging via `ExecutionContext`, `Dashboard.first`,
  `connection.execute "SELECT 1"`).
- Keep the genuinely-unit tests (`escaping good comment`, formatter classes,
  `GetKeyHandler`) as-is — their Rails counterparts use `send(:escape_sql_comment)`
  directly and don't touch fixtures.
- **Unskip** `connection is passed to tagging proc` +
  `connection does not override already existing connection in context`
  (`query-logs.test.ts:104,110`) — these are the concrete deliverable now that
  the connection context (PR 1) and pipeline wiring (PR 3) exist.
- Use `{ schema: canonicalSchema }` to defend against sibling-file schema
  contamination.
- **No exclude-list edit:** the file is not on
  `eslint/test-fixture-parity-exclude.json` (post-#2790), and the
  `useHandlerFixtures` rewrite satisfies `test-fixture-parity` by construction,
  so nothing needs adding or removing there.
- **Files:** `src/query-logs.test.ts` only.

## Verification (per PR and final)

- `pnpm vitest run packages/activerecord/src/query-logs.test.ts` — green,
  with the two connection tests **unskipped** and passing.
- `npx eslint packages/activerecord/src/query-logs.test.ts` — stays at 0
  `blazetrails/test-fixture-parity` errors (it already passes; the
  `useHandlerFixtures` rewrite must not regress it).
- `pnpm run api:compare --package activerecord` — `QueryLogs#call` /
  `query_transformers` surface covered.
- Regression guard for PR 3: existing tests subscribing to
  `sql.active_record` (e.g. `query-cache.test.ts`, `base.test.ts`,
  `counter-cache.test.ts`) still pass.
- Do **not** run the full suite locally; rely on CI per CLAUDE.md.

## Risks / open questions

1. **Instrumentation reorder (PR 3)** is the highest-risk change and a
   **Rails-fidelity decision requiring user sign-off**. Default to Option A
   (Rails-faithful, instrument in `rawExecute`); choose B only if its skipped-path
   audit (see Key architectural finding) comes back clean and the user accepts
   the divergence for blast radius.
2. **Global mutable registry + ExecutionContext** are process-global; tests
   must save/restore `queryTransformers`, `tags`, and clear `ExecutionContext`
   in `beforeEach`/`afterEach`, exactly as the Rails `setup`/`teardown` does.
3. **`application: -> { "active_record" }` tagging** — Rails sets this default
   in `setup`; the TS port must register the same default taggings so
   `Dashboard.first` emits `/*application:active_record*/`.
4. If Option A's `rawExecute` refactor proves too invasive across adapters,
   Option B is the bounded fallback — but only after the skipped-path audit and
   user sign-off on the divergence. Either way this should not block PRs 1, 2,
   4, which are independently valuable.

## Sequencing

PRs 1, 2, 4 are independent and can be opened in parallel from `main`
(non-overlapping files). Merge order: {1, 2, 4} → 3 → 5.

**No-stacking discipline (CLAUDE.md).** PR 3 references the `queryTransformers`
symbol from PR 1, and PR 5 depends on PRs 1–4. To avoid stacked branches, PR 3
is **branched from `main` only after PR 1 merges**, and PR 5 only after PRs 1–4
merge — "ship the first PR, wait for merge, then open the next from updated
`main`." Do **not** open PR 3 or PR 5 in parallel against symbols not yet on
`main`; that would either fail CI or make them de-facto stacked. Only the
independent set {1, 2, 4} is opened concurrently.
