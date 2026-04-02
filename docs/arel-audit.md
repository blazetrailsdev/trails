# Arel: Rails Fidelity Audit

File-by-file comparison against Rails v8.0.2. Only actionable behavioral
mismatches listed — Ruby-specific patterns (hash/eql overrides, operator
overloading, symbol types, etc.) that have no TS equivalent are omitted.

## Bugs (wrong SQL or behavior)

### visitors/to-sql.ts

- `visitComment()` doesn't sanitize values — SQL injection risk
- Missing `prepare_update_statement()` / `prepare_delete_statement()` transforms for UPDATE/DELETE with JOINs or LIMIT/OFFSET
- Missing DELETE with JOINs handling ("DELETE table FROM" syntax)
- Missing `HomogeneousIn` node support

### visitors/mysql.ts

- Missing `visitNullsFirst()`/`visitNullsLast()` — MySQL needs `column IS NOT NULL, column` syntax instead of `NULLS FIRST`
- Missing `visitSelectCore()` DUAL table for empty FROM clause

### visitors/sqlite.ts

- Missing `visitLock()` override — SQLite should ignore locks silently

### select-manager.ts

- `as()` doesn't wrap AST in `grouping()` — produces wrong SQL for subqueries (missing parentheses)
- `group()` doesn't wrap columns in `Group` nodes

### delete-manager.ts / update-manager.ts

- `group()` doesn't wrap columns in `Group` nodes

### attributes/attribute.ts

- `notEq()` doesn't call `castValue(other)` but `eq()` does — inconsistent type casting

### matches.ts

- Doesn't apply `Nodes.build_quoted` to escape parameter

### case.ts

- `when()` returns new Case with cloned conditions; Rails mutates in-place and returns self
- Missing `When`/`Then` node wrapping for condition/result pairs

### table-alias.ts

- `get()` returns SqlLiteral; Rails returns `Attribute.new(self, name)` — affects query building on aliased tables

### and.ts

- Extends `Node` directly; Rails extends `Nary` — missing `fetchAttribute` behavior

## Wrong parent class (may affect visitor dispatch)

These nodes extend `Node` directly but Rails has them extend `Unary` or
`Binary`. This can affect visitor dispatch if visitors rely on parent class:

- grouping.ts — should extend Unary
- over.ts — should extend Binary
- extract.ts — should extend Unary
- filter.ts — should extend Binary
- with.ts — should extend Unary
- values-list.ts — should extend Unary
- ascending.ts / descending.ts — should extend Ordering

## Add when needed (low priority)

### factory-methods.ts

- Missing: `createTrue`, `createFalse`, `createAnd`, `createOn`, `lower`, `coalesce`, `cast`

### predications.ts

- Missing: `matchesRegexp`, `doesNotMatchRegexp`, `does_not_match_any/all` variants

### visitors/dot.ts

- Simplified implementation — missing edge tracking and 20+ specific visit methods

### homogeneous-in.ts

- `procForBinds` returns null; Rails returns lambda for bind parameter creation

### bound-sql-literal.ts

- Error format differs from Rails `BindError`
