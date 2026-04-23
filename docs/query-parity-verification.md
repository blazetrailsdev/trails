# Query parity verification

Goal: verify that trails produces identical SQL (and bind params) to Rails
for equivalent Arel / ActiveRecord queries, by running both against the
same SQLite fixture and diffing canonical JSON outputs.

Extends the schema parity pipeline (`docs/activerecord-rails-parity-verification.md`).
Same three-job CI shape (ruby side, node side, diff), same fixture layout.

---

## Scope

**v1 (this plan): Arel only.**
55 fixtures in `scripts/parity/fixtures/arel-XX/`.
No AR model definitions needed — Arel operates on raw `Table`/`Attribute`
objects. The query expression is evaluated and `to_sql` / `toSql()` called
directly on the result.

**v2 (follow-on): ActiveRecord queries.**
50 fixtures in `scripts/parity/fixtures/ar-XX/`. Requires model generation
(auto-derived from schema FKs) and `has_many`/`belongs_to`/`through` inference.
Not in scope here.

---

## Canonical query format

New file: `scripts/parity/canonical/query.schema.json` (draft 2020-12).

```ts
type CanonicalQuery = {
  version: 1;
  fixture: string; // e.g. "arel-01"
  frozenAt: string; // ISO 8601 UTC — the time both sides were frozen to
  sql: string; // result of to_sql / toSql()
  binds: string[]; // ordered bind values, all stringified
};
```

**`sql`** — the SQL string produced by `to_sql` (Ruby) / `toSql()` (TS) on
the expression returned by the query script. For a full `SelectManager`
this is a complete SELECT. For a predicate node (`Equality`, `LessThan`,
etc.) it is the condition fragment. For an `Attribute` it is the quoted
column reference.

**`binds`** — ordered list of bind values as strings. Rails returns
`[["col", val], ...]`; we stringify just the values into `string[]` to
match what trails produces. This is `[]` for most Arel node expressions
that have no bind parameters.

**`frozenAt`** — ISO 8601 UTC string (e.g. `"2026-04-23T19:00:00.000Z"`).
Set once per run by the orchestrator and passed to both sides. Both sides
freeze time to this value before running the query.

---

## Fixture layout (per fixture)

```
scripts/parity/fixtures/arel-XX/
  schema.sql        # existing — DB schema + query comment
  query.rb          # GENERATED — Ruby Arel expression
  query.ts          # GENERATED — trails Arel expression
  expected.json     # manifest: { "tables": [...], "indexCount": N }
```

`query.rb` and `query.ts` are generated once by a translation tool
(see PR2) and then committed. They are plain expressions — no boilerplate,
no require/import — the runners wrap them.

### query.rb shape

```ruby
# arel-06: users[:name].eq('amy')
users = Arel::Table.new(:users)
users[:name].eq('amy')
```

The last expression is the one `to_sql` is called on.

### query.ts shape

```ts
// arel-06: users[:name].eq('amy')
import { Table } from "@blazetrails/arel";
const users = new Table("users");
users.get("name").eq("amy");
```

The last expression is the one `.toSql()` is called on. Node expressions
expose it via the base `Node` class (`packages/arel/src/nodes/node.ts:30`);
manager expressions such as `SelectManager` inherit it from `TreeManager`
(`packages/arel/src/tree-manager.ts:72`). No separate `ToSql` import is
needed in the runner.

---

## Translation map (Arel Ruby → trails TypeScript)

Rule-based; covers all 55 Arel fixtures. All method names verified against
the trails Arel source (`packages/arel/src/`).

| Ruby                                           | TypeScript                                         | Source                            |
| ---------------------------------------------- | -------------------------------------------------- | --------------------------------- |
| `Arel::Table.new(:foo)`                        | `new Table("foo")`                                 | `table.ts`                        |
| `tbl[:col]`                                    | `tbl.get("col")`                                   | `table.ts:68`                     |
| `tbl[Arel.star]`                               | `tbl.star`                                         | `table.ts:88`                     |
| `node.as("alias")`                             | `node.as("alias")`                                 | `alias-predication.ts`            |
| `node.eq(val)`                                 | `node.eq(val)`                                     | `filter-predications.ts`          |
| `node.not_eq(val)`                             | `node.notEq(val)`                                  | `filter-predications.ts`          |
| `node.lt / gt / lteq / gteq`                   | `node.lt / gt / lteq / gteq`                       | `filter-predications.ts`          |
| `node.in([...])`                               | `node.in([...])`                                   | `filter-predications.ts`          |
| `node.not_in([...])`                           | `node.notIn([...])`                                | `filter-predications.ts`          |
| `node.matches('%str%')`                        | `node.matches("%str%")`                            | `filter-predications.ts`          |
| `node.and(other)`                              | `node.and(other)`                                  | `filter-predications.ts`          |
| `node.or(other)`                               | `node.or(other)`                                   | `filter-predications.ts`          |
| `node.not`                                     | `node.not()`                                       | `filter-predications.ts`          |
| `~node` (bitwise NOT)                          | `new Nodes.BitwiseNot(node)`                       | `nodes/unary-operation.ts:40`     |
| `node & val`                                   | `node.bitwiseAnd(val)`                             | `attributes/attribute.ts:354`     |
| `node \| val`                                  | `node.bitwiseOr(val)`                              | `attributes/attribute.ts:358`     |
| `node ^ val`                                   | `node.bitwiseXor(val)`                             | `attributes/attribute.ts:362`     |
| `node << val`                                  | `node.bitwiseShiftLeft(val)`                       | `attributes/attribute.ts:366`     |
| `node >> val`                                  | `node.bitwiseShiftRight(val)`                      | `attributes/attribute.ts:370`     |
| `node.add / subtract / multiply / divide`      | same camelCase                                     | `math.ts`                         |
| `node.count`                                   | `node.count()`                                     | `attributes/attribute.ts:382`     |
| `node.count(true)` (distinct)                  | `node.count(true)`                                 | `attributes/attribute.ts:382`     |
| `node.sum / maximum / minimum / average`       | `node.sum() / maximum() / minimum() / average()`   | `attributes/attribute.ts:386-398` |
| `node.extract('month')`                        | `node.extract("month")`                            | `attributes/attribute.ts:472`     |
| `node.over(window)`                            | `node.over(window)`                                | `attributes/attribute.ts:532`     |
| `tbl.project(...)`                             | `tbl.project(...)`                                 | `table.ts:76`                     |
| `tbl.where(cond)`                              | `tbl.where(cond)`                                  | `select-manager.ts`               |
| `tbl.order(...)`                               | `tbl.order(...)`                                   | `table.ts:186`                    |
| `tbl.take(n)`                                  | `tbl.take(n)`                                      | `select-manager.ts`               |
| `tbl.skip(n)`                                  | `tbl.skip(n)`                                      | `select-manager.ts`               |
| `tbl.group(...)`                               | `tbl.group(...)`                                   | `select-manager.ts`               |
| `mgr.having(cond)`                             | `mgr.having(cond)`                                 | `select-manager.ts`               |
| `mgr.distinct`                                 | `mgr.distinct()`                                   | `select-manager.ts:252`           |
| `tbl.join(other)`                              | `tbl.join(other)`                                  | `table.ts:146`                    |
| `tbl.join(other, OuterJoin)`                   | `tbl.join(other, Nodes.OuterJoin)`                 | `table.ts:162`                    |
| `tbl.alias(:name)`                             | `tbl.alias("name")`                                | `table.ts`                        |
| `mgr.with(cte)`                                | `mgr.with(cte)`                                    | `select-manager.ts:268`           |
| `mgr.with(:recursive, cte)`                    | `mgr.withRecursive(cte)`                           | `select-manager.ts:274`           |
| `mgr.window("name")`                           | `mgr.window("name")`                               | `select-manager.ts:243`           |
| `Arel.sql(str)`                                | `sql(str)`                                         | `index.ts:34`                     |
| `Arel.star`                                    | `star`                                             | `index.ts:43`                     |
| `Arel::Nodes::Quoted.new(val)` / `quoted(val)` | `new Nodes.Quoted(val)`                            | `nodes/quoted.ts`                 |
| `Arel::Nodes::NamedFunction.new(name, args)`   | `new Nodes.NamedFunction(name, args)`              | `nodes/named-function.ts`         |
| `Time.now / Time.zone.now`                     | `new Date(frozenAt)`                               | time-frozen                       |
| `1.week.ago`                                   | `new Date(Date.parse(frozenAt) - 7*24*60*60*1000)` | time-frozen                       |

---

## Time freezing

**Mechanism:**

- The orchestrator (`scripts/parity/run.ts`) records `new Date().toISOString()`
  at the start of a run as `PARITY_FROZEN_AT`.
- Passes it to both ruby and node sides as an environment variable.
- Ruby: `ActiveSupport::Testing::TimeHelpers#travel_to(Time.parse(ENV["PARITY_FROZEN_AT"]))`
  — from `activesupport` (already a dep via `activerecord`).
- Node: `import FakeTimers from "@sinonjs/fake-timers"` — planned root
  devDependency, added in PR4. `const clock = FakeTimers.install({ now: new Date(frozenAt) })`.
  Call `clock.uninstall()` after the query runs.
- `frozenAt` written into the canonical output JSON for auditability.

**Fixture-level override (future):**
If a fixture needs a specific frozen time, add `"frozenAt": "2025-06-01T00:00:00Z"`
to its `expected.json`. The runner uses that instead of the run-global value.

---

## PR plan (5 small PRs)

---

### PR1 — Canonical query format

**Branch:** `parity-query-pr1-canonical`

Files to add:

1. `scripts/parity/canonical/query.schema.json` — JSON Schema for `CanonicalQuery`.
2. `scripts/parity/canonical/query-types.ts` — TS interface.

No runner, no fixtures. `pnpm parity:validate` extended to also validate
`query.schema.json`.

---

### PR2 — Translation tool + generated query files

**Branch:** `parity-query-pr2-translate`

Files to add:

1. `scripts/parity/translate/arel.ts` — CLI:
   `tsx scripts/parity/translate/arel.ts [--fixture arel-XX]`
   Reads `schema.sql` comment, applies the translation map, writes
   `query.rb` and `query.ts` into the fixture directory.
   Run once, review, commit.
2. `scripts/parity/fixtures/arel-{01..55}/query.rb` — generated + reviewed.
3. `scripts/parity/fixtures/arel-{01..55}/query.ts` — generated + reviewed.

**Acceptance:** All 55 fixtures have both files. Running the translator again
is idempotent (no diff).

---

### PR3 — Ruby query runner

**Branch:** `parity-query-pr3-ruby`

Files to add:

1. `scripts/parity/query/ruby/dump.rb` — CLI:
   `bundle exec ruby dump.rb <fixture-dir> <out.json> [--frozen-at <iso>]`
   - Apply `schema.sql` to temp SQLite.
   - `travel_to(Time.parse(frozen_at))` if time-sensitive query.
   - `eval(File.read("query.rb"))` — last expression is the Arel node/manager.
   - Call `.to_sql` on the result.
   - Capture binds (if a SelectManager, use `connection.to_sql(mgr.ast, binds)`;
     otherwise `[]`).
   - Write canonical JSON.
2. Gemfile addition: no new gems needed (`activesupport` already present).

---

### PR4 — Node query runner

**Branch:** `parity-query-pr4-node`

Files to add:

1. `scripts/parity/query/node/dump.ts` — CLI:
   `tsx scripts/parity/query/node/dump.ts <fixture-dir> <out.json> [--frozen-at <iso>]`
   - Apply `schema.sql` to temp SQLite.
   - Install `FakeTimers` if `frozenAt` present.
   - Dynamic import of `query.ts` from the fixture dir.
   - Call `.toSql()` on the result. All nodes and managers expose it
     via `Node` (nodes) or `TreeManager` (managers); no `ToSql` import is needed.
   - Write canonical JSON.
2. Root devDependency: `@sinonjs/fake-timers` + `@types/sinonjs__fake-timers`.

---

### PR5 — Runner + CI wiring

**Branch:** `parity-query-pr5-ci`

Files to edit:

1. `scripts/parity/run.ts` — add `--type=query` flag (default: `schema`).
   `rails`/`trails`/`diff`/`all` semantics mirror the schema pipeline.
   `PARITY_FROZEN_AT` env set at run start, forwarded to both sides.
2. `package.json` — add `parity:query` script.
3. `.github/workflows/ci.yml` — add `query-parity-rails`,
   `query-parity-trails`, `query-parity-diff` jobs (same pattern as schema
   parity jobs). Pass `PARITY_FROZEN_AT` from the rails+trails parallel
   step.

---

## Deferred to v2 (AR fixtures)

- Model auto-generation from schema (FK → `belongs_to`, inverse → `has_many`,
  join table → `has_many :through`).
- Named scopes in model definitions.
- AR query runner (needs model loading before query eval).
- `ar-XX` fixtures.
