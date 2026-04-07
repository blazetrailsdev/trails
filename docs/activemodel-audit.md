# ActiveModel: Rails Fidelity Audit

File-by-file comparison against Rails v8.0.2. Only actionable behavioral
mismatches listed — Ruby-specific patterns (method_missing, freeze/dup,
symbols, operator overloading, etc.) that have no TS equivalent are omitted.

## Bugs (wrong behavior)

### attribute.ts

- `FromUser.came_from_user?` always returns `true`; Rails checks `value_constructed_by_mass_assignment?`

### naming.ts

- `param_key` doesn't use namespace-aware logic (ActiveRecord isolate_namespace concern)

## Missing validation features

### acceptance.ts

- Missing `setup!()` to define attributes on class

### confirmation.ts

- Missing `setup!()` for confirmation attribute definition

## Add when needed (low priority)

### callbacks.ts

- Only function callbacks; Rails also supports class-based

### secure-password.ts

- Missing: `password_salt`, `generates_token_for`

### translation.ts

- Missing full lookup chains with namespace handling

### attribute-registration.ts

- Missing `resolve_attribute_name`, `resolve_type_name`, `hook_attribute_type` hooks

### attribute-set/builder.ts

- `LazyAttributeSet` not actually lazy (performance issue on large schemas)
