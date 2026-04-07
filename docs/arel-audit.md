# Arel: Rails Fidelity Audit

File-by-file comparison against Rails v8.0.2. Only actionable behavioral
mismatches listed — Ruby-specific patterns (hash/eql overrides, operator
overloading, symbol types, etc.) that have no TS equivalent are omitted.

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
