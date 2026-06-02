# QueryLogs — True Rails Parity Plan ✅ COMPLETE

**Status: COMPLETE** (PRs 1–5: #2801, #2803, PR 4 was a no-op — the
`assertQueriesMatch`/`SQLCounter` helper already existed on `main` at
`testing/query-assertions.ts` — #2809, #2836). `QueryLogs` is wired into the
real SQL-execution path, the `sql.active_record` payload carries the
post-preprocess (commented) SQL, and the two connection-tagging tests are
unskipped (`query_logs_test.rb` 25/25). `tagContent` now sorts tags by key to
match Rails (#2836). See memory `project_querylogs_fixture_parity_blocked`.

This doc is retained only for the optional forward-looking follow-ups below; the
full implementation plan has been removed.

## Forward-looking follow-ups (optional, from #2836 finding)

- **~medium LOC** — Make `tagContent` read `ActiveSupport::ExecutionContext.to_h`
  like Rails (every query merges the live ExecutionContext) instead of reading
  the QueryLogs instance `_context` via `updateContext`. Touches `query-logs.ts`
  - activesupport `ExecutionContext`, and re-points the test context-seeding from
    `updateContext(...)` to `ExecutionContext.set(...)`. Not needed for test parity.
- **~3 line-edits** — Align the three `escaping …` unit tests
  (`query-logs.test.ts:71-83`) to Rails' exact literal inputs (`app:foo`,
  `app='foo'`, the `*/; DROP TABLE USERS;/*` cases at
  `query_logs_test.rb:43-56`). `escape_sql_comment` behavior is already
  identically exercised; only the literals differ.

## Known deviations (justified, not action items)

- **Raw-SELECT target.** Tests drive `select dashboard_id from dashboards`
  instead of Rails' `select id from posts`, avoiding the documented shared-`posts`
  per-worker-DB contention across the AR handler suite. Assertion anchoring
  preserved.
- **`invalid encoding query`** (`query-logs.test.ts:350`) relies on Node's
  string→UTF-8 FFI conversion replacing the lone surrogate `\uD800` with U+FFFD
  rather than throwing — verified locally. `skipIf(postgres)` mirrors Rails'
  `unless current_adapter?(:PostgreSQLAdapter)`. If CI ever fails this test, the
  FFI conversion assumption is the thing to check.
  </content>
