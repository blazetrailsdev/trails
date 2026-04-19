# Arel: Rails Fidelity Audit

File-by-file comparison against Rails v8.0.2. Only actionable behavioral
mismatches listed — Ruby-specific patterns (hash/eql overrides, operator
overloading, symbol types, etc.) that have no TS equivalent are omitted.

## Add when needed (low priority)

### visitors/dot.ts

- Simplified implementation — missing edge tracking and 20+ specific visit methods

### bound-sql-literal.ts

- Error format differs from Rails `BindError`
