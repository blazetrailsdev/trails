# ActiveModel: Rails Fidelity Audit

File-by-file comparison against Rails v8.0.2. Only actionable behavioral
mismatches listed — Ruby-specific patterns (method_missing, freeze/dup,
symbols, operator overloading, etc.) that have no TS equivalent are omitted.

## Bugs (wrong behavior)

### boolean.ts

- Empty string `""` should return `null`; currently returns truthy

### confirmation.ts

- Error added to base attribute; Rails adds to `#{attr}_confirmation`

### acceptance.ts

- Default accept values: `[true, "true", "1", 1, "yes"]` vs Rails `["1", true]`
- Missing `allow_nil: true` default

### attribute.ts

- `value_for_database` caches without re-checking `type.changed_in_place?` — can return stale serialized value
- `FromUser.came_from_user?` always returns `true`; Rails checks `value_constructed_by_mass_assignment?`

### naming.ts

- Missing `_index` suffix on route_key for uncountable nouns
- `param_key` doesn't use namespace-aware logic

### i18n.ts

- Missing error messages: `password_too_long`, `in`, `model_invalid`

## Missing `value:` in error options (affects i18n interpolation)

These validators don't include `value:` in the options passed to error messages,
which means `%{value}` interpolation in custom error messages won't work:

- comparability.ts (`errorOptions` only returns `count`)
- comparison.ts
- exclusion.ts
- format.ts
- inclusion.ts
- numericality.ts

## Missing validation features

### clusivity.ts

- Missing `:within` alias for `:in`
- Missing Array value handling (`value.all?` check for array membership)

### length.ts

- Missing `minimum: 1` when `allow_blank: false` with no constraint
- Nil-skip logic differs (Rails has special case for maximum only)
- Only handles string/array length; Rails handles any `respond_to?(:length)`

### comparison.ts

- Missing `value.blank?` check with blank error

### numericality.ts

- `:in` uses `[min, max]` array; Rails uses Range
- Doesn't reject hexadecimal literals

### acceptance.ts

- Missing `setup!()` to define attributes on class

### confirmation.ts

- Missing `setup!()` for confirmation attribute definition

## Add when needed (low priority)

### callbacks.ts

- Missing `:only` option to limit callback types
- Only function callbacks; Rails also supports class-based

### secure-password.ts

- Missing: `password_salt`, `password_challenge`, `generates_token_for`

### translation.ts

- Missing full lookup chains with namespace handling

### attribute-registration.ts

- Missing `resolve_attribute_name`, `resolve_type_name`, `hook_attribute_type` hooks

### attribute-set/builder.ts

- `LazyAttributeSet` not actually lazy (performance issue on large schemas)

### uuid.ts

- Doesn't accept braced `{...}` or dashless UUID formats
- Missing `format_uuid()` normalization
