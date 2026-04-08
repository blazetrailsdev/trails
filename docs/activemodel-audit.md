# ActiveModel: Rails Fidelity Audit

File-by-file comparison against Rails v8.0.2. Only actionable behavioral
mismatches listed — Ruby-specific patterns (method_missing, freeze/dup,
symbols, operator overloading, etc.) that have no TS equivalent are omitted.

## Bugs (wrong behavior)

### naming.ts

- `param_key` doesn't use namespace-aware logic (ActiveRecord isolate_namespace concern)

## Known deviations from Rails

### acceptance/confirmation virtual attributes

Rails uses `method_missing` + `LazilyDefineAttributes` to lazily define
acceptance/confirmation attributes only when accessed. TypeScript has no
`method_missing` equivalent, so we define them eagerly at validator
registration time via `attribute(name, "string", { virtual: true })`.
The `virtual` flag excludes them from `attributeNames()` and
`serializableHash()`, matching Rails' behavior where these attributes
are invisible to introspection and serialization. The only difference
is timing: Rails defines on first access, we define at registration.

## Add when needed (low priority)

### secure-password.ts

- Missing: `generates_token_for`

### translation.ts

- Missing full lookup chains with namespace handling

### attribute-registration.ts

- Missing `resolve_attribute_name`, `resolve_type_name`, `hook_attribute_type` hooks

### attribute-set/builder.ts

- `LazyAttributeSet` implemented but not wired in — interacts with ActiveRecord dirty tracking/optimistic locking; needs careful integration
