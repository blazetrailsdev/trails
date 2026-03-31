# WS3: Finances Tutorial

## Dependencies

- WS1 PRs 1–6 merged (types, diff engine, fixtures, UI components, routes, Monaco)
- Can run in parallel with WS2

## Approach

TDD. Every SQL query, every CSV parse, every diff anchor is validated by automated replay tests. The Finances tutorial has the most complex SQL — the replay test actually executes every query and asserts it returns meaningful results against the seeded data.

---

## PR Sequence

### PR 1: Finances steps 1–5 (data model + seeds)

**Write tests first:**

```
src/lib/frontiers/tutorials/finances/
  finances-replay.test.ts — Boots createRuntime(), replays steps 1–5:
                            Step 1: exec("new finances"), assert scaffold
                            Step 2: exec("generate model Account ..."),
                                    exec("generate model Category ..."),
                                    exec("db:migrate"),
                                    assert tables accounts + categories exist
                                    Validate: decimal columns present in schema
                            Step 3: exec("generate model Transaction ..."),
                                    exec("db:migrate"),
                                    applyDiffs for associations,
                                    assert table exists + associations declared
                                    Validate: date column present in schema
                            Step 4: exec("generate model Budget ..."),
                                    exec("db:migrate"),
                                    applyDiffs for associations,
                                    assert table + associations
                            Step 5: applyDiff for seeds.ts, exec("db:seed"),
                                    assert row counts (transactions 50+, budgets 10+)
                                    Validate seed data:
                                    - All transactions.account_id → valid account
                                    - All transactions.category_id → valid category
                                    - All budgets.category_id → valid category
                                    - Transaction dates are valid YYYY-MM-DD
                                    - Budget months are valid YYYY-MM
                                    - Account balances are reasonable decimals
                                    - Income transactions have positive amounts
                                    - Expense transactions have negative amounts

                            Also validates:
                            - Rule of threes (prose + diagram + actions per step)
                            - Panes arrays present
                            - Anchors resolve
                            - Diagrams are valid mermaid
```

**Then implement:**

```
src/lib/frontiers/tutorials/
  registry.ts           — Update Finances entry
  finances/
    index.ts
    steps/
      step-01.ts        — "Setting Up"
                          Panes: terminal, file-tree, editor, console
                          CLI: new finances
                          Diagram: flow — what we'll build
      step-02.ts        — "Accounts and Categories"
                          Panes: terminal, file-tree, editor, database, console
                          Concept: decimal columns for money
                          CLI: generate Account, Category, db:migrate
                          Diagram: ER — Account, Category (self-referential)
      step-03.ts        — "Transactions"
                          Panes: terminal, file-tree, editor, database, console
                          Concept: date columns
                          CLI: generate Transaction, db:migrate
                          Diffs: associations on Account, Category, Transaction
                          Diagram: ER — Transaction links Account + Category
      step-04.ts        — "Budgets"
                          Panes: terminal, file-tree, editor, database, console
                          Concept: composite uniqueness (category + month)
                          CLI: generate Budget, db:migrate
                          Diffs: Budget association
                          Diagram: ER — full 4-entity model
      step-05.ts        — "Seeding Financial Data"
                          Panes: terminal, file-tree, editor, database, console
                          Diff: db/seeds.ts with realistic data:
                            3 accounts (Checking $4250, Savings $12000,
                              Credit Card -$1847.50)
                            10 categories (with parent hierarchy)
                            60+ transactions across Jan–Mar 2025
                            Monthly budgets per expense category
                          CLI: db:seed
                          Diagram: flow — account + category structure
```

**Review criteria:**

- Replay test passes for steps 1–5
- Seed data is financially coherent (tested assertions listed above)
- Transaction descriptions are realistic ("Whole Foods", "Electric bill", etc.)
- Budget amounts are reasonable monthly targets

---

### PR 2: Finances steps 6–8 (CSV import + analytical SQL)

**Write tests first — extend replay test:**

```
src/lib/frontiers/tutorials/finances/
  finances-replay.test.ts — Extend to replay steps 6–8:
                            Step 6: applyDiff for CSV file, applyDiff for importer,
                                    exec("run lib/csv-importer.ts"),
                                    assert transaction count increased
                                    Validate CSV importer:
                                    - Parse produces correct number of rows
                                    - Category name lookup finds valid IDs
                                    - Account name lookup finds valid IDs
                                    - Invalid rows are skipped (not inserted)
                            Step 7: applyDiffs for 3 SQL query files,
                                    Execute each SQL query against the runtime,
                                    assert each returns rows (not empty)
                                    Validate query results:
                                    - spending-by-category: totals are positive numbers
                                    - monthly-totals: 3+ months of data
                                    - running-balance: balances change over time
                            Step 8: applyDiffs for budget-variance.sql + budget-report.ts,
                                    Execute the SQL query,
                                    assert results have budgeted/actual/remaining/status columns
                                    exec("run lib/budget-report.ts"),
                                    assert no error
                                    Validate:
                                    - LEFT JOIN produces rows for all budgeted categories
                                    - Categories with no transactions show 0 actual
                                    - OVER budget shows status "OVER"
```

**Then implement:**

```
src/lib/frontiers/tutorials/finances/steps/
  step-06.ts            — "CSV Import"
                          Panes: terminal, file-tree, editor, repl, database, console
                          Introduces: REPL — dedicated callout explaining interactive
                            evaluation, access to adapter/runtime, prototyping before
                            committing to a file
                          Diff: data/import-sample.csv (15 transaction rows)
                          Diff: lib/csv-importer.ts:
                            - Simple CSV format (no quoting, no commas in values)
                            - Split on newlines, skip header
                            - Split each line on commas
                            - Lookup category_id by name via SQL
                            - Lookup account_id by name via SQL
                            - Insert with parameterized query
                            - Return { imported, skipped, errors }
                          CLI: run lib/csv-importer.ts
                          Diagram: flow — CSV → parse → validate → lookup → INSERT
  step-07.ts            — "GROUP BY and Aggregation"
                          Panes: terminal, file-tree, editor, sql, database, console
                          Concept: GROUP BY, aggregate functions, HAVING
                          Diffs: 3 SQL query files:
                            spending-by-category.sql (GROUP BY + SUM + COUNT)
                            monthly-totals.sql (CASE WHEN for income/expense)
                            running-balance.sql (correlated subquery or window)
                          CLI: sql queries/finances/spending-by-category.sql
                          Diagram: flow — transactions → GROUP BY → summaries
  step-08.ts            — "Budget vs. Actual"
                          Panes: terminal, file-tree, editor, sql, database, console
                          Concept: LEFT JOIN, COALESCE, CASE expressions
                          Diffs: budget-variance.sql, lib/budget-report.ts
                          CLI: run lib/budget-report.ts
                          Diagram: flow — budget + actual → LEFT JOIN → variance
```

**SQL quality (enforced by test):**

- Every SQL query executes without error against the seeded database
- Every query returns at least 1 row
- Aggregate values are numerically reasonable
- LEFT JOIN produces rows even for categories with no transactions
- All SQL is valid SQLite (no Postgres-only syntax)

**Review criteria:**

- Replay test passes for steps 6–8
- CSV importer uses parameterized queries (no SQL injection)
- SQL queries are readable (aliased columns, formatted)
- REPL introduction callout is present in step 6
- Each step has description + diagram + code

---

### PR 3: Finances steps 9–10 (advanced queries + API)

**Write tests first — extend replay test:**

```
src/lib/frontiers/tutorials/finances/
  finances-replay.test.ts — Extend to replay steps 9–10:
                            Step 9: applyDiffs for 3 advanced query files,
                                    Execute each query against the runtime:
                                    - running-total.sql: returns rows with running_total
                                      column that increases over time
                                    - category-hierarchy.sql: returns rows with path
                                      column showing parent > child
                                    - moving-average.sql: returns rows with seven_day_avg
                                      column
                                    All queries execute without error
                            Step 10: applyDiffs for 3 controllers + routes,
                                     exec("server"),
                                     assert GET /api/accounts → 200
                                     assert GET /api/transactions → 200
                                     assert GET /api/reports/spending → 200
                                     assert GET /api/reports/monthly → 200
                                     assert GET /api/reports/budget → 200
                                     Validate response shapes:
                                     - /api/accounts returns array with balance field
                                     - /api/reports/spending returns array with category + total
```

**Then implement:**

```
src/lib/frontiers/tutorials/finances/steps/
  step-09.ts            — "Advanced Queries"
                          Panes: file-tree, editor, sql, database, console
                          Concept: window functions (SUM OVER), CTEs (WITH RECURSIVE)
                          Diffs: 3 query files:
                            running-total.sql — SUM() OVER (ORDER BY date)
                            category-hierarchy.sql — WITH RECURSIVE for tree traversal
                            moving-average.sql — AVG() OVER (ROWS BETWEEN 6 PRECEDING...)
                          CLI: sql queries/finances/running-total.sql
                          Diagram: flow — raw data → window function → enriched rows
  step-10.ts            — "Dashboard API"
                          Panes: terminal, file-tree, editor, results, database, sql, console
                          Diffs: 3 controllers:
                            accounts-controller.ts — index with computed balances
                            transactions-controller.ts — index with month/category filters
                            reports-controller.ts — spending, monthly, budget actions
                          Diff: config/routes.ts with /api/ prefix
                          CLI: server
                          Diagram: flow — API namespace (6 endpoints grouped by resource)
```

**Review criteria:**

- Full 10-step replay test passes
- Window function queries use SQLite-compatible syntax
- Recursive CTE correctly traverses category parent→child relationships
- Report controllers reuse query patterns from steps 7–8
- API routes consistently use `/api/` prefix
- Response JSON has meaningful structure (not just raw SQL rows)

---

### PR 4: Static tutorial snapshot

**Size:** 1 static file. Tiny. **Depends on PR 3.**

Extend `scripts/build-tutorial-snapshots.ts` to include Finances. Run full replay, export to `packages/website/static/tutorials/finances.sqlite`.

**Test:** Replay test already validates the final state.

---

## Parallelization

```
PR 1 ──→ PR 2 ──→ PR 3 ──→ PR 4
(1–5)    (6–8)    (9–10)   (.sqlite)
```

Sequential within WS3, but **runs in parallel with WS2**. Shared files (`registry.ts`, `scripts/build-tutorial-snapshots.ts`) are pre-stubbed in WS1 to avoid merge conflicts.

---

## Test Summary

| PR  | Tests                            | What they verify                                                |
| --- | -------------------------------- | --------------------------------------------------------------- |
| 1   | `finances-replay.test.ts` (1–5)  | Model generation, seed data FK integrity, decimal/date columns  |
| 2   | `finances-replay.test.ts` (6–8)  | CSV parser, SQL query validity + results, LEFT JOIN correctness |
| 3   | `finances-replay.test.ts` (9–10) | Window functions, CTEs, API responses, full 10-step replay      |
| 4   | (reuses replay)                  | Snapshot loads and final state checks pass                      |

Every SQL query is tested against real data. Every diff anchor is validated. A generator change that breaks an anchor fails CI before it ships.
