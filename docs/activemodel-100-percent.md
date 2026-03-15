# ActiveModel: 100% Convention Compare Coverage

ActiveModel has reached **100% convention:compare coverage** — 963/963 tests
across 56/56 files with 0 misplaced tests. 5 of those tests are skipped via
`it.skip()` (railtie — Rails-specific initialization hooks with no TS equivalent).

## What's implemented

### Core modules

- **Model** — base class with attributes, validations, callbacks, dirty tracking, serialization, naming
- **Errors** — error collection with i18n-aware message generation, full messages, hierarchical key lookup
- **I18n** — translation service with dot-path lookup, defaults chain, pluralization, interpolation
- **DirtyTracker** — change tracking with `changes`, `previousChanges`, `changesApplied`, `restoreAttributes`
- **Callbacks** — before/after/around lifecycle hooks for validation, save, create, update, destroy
- **Serialization** — `serializableHash`, `asJson`, `toJson`, `fromJson`, `toXml` with include/only/except options

### Validations

All Rails validators are implemented:

- Presence, Absence, Length, Numericality, Inclusion, Exclusion
- Format (with/without regexp), Acceptance, Confirmation, Comparison
- Custom validators via `validate()`, `validatesEach()`, `validatesWith()`
- Conditional validation (`if`/`unless`), strict validation, context-based validation

### Type system

Complete type casting and serialization:

- String, Integer, Float, Boolean, Date, DateTime, Time
- Decimal, BigInteger, Binary, ImmutableString, UUID, JSON, Value
- Custom type registration via `typeRegistry.register()`

### SecurePassword

`hasSecurePassword` with bcrypt:

- Password hashing (configurable cost, default 12)
- `authenticate()` method
- Byte-size validation (max 72), confirmation, blank detection
- Custom attribute support (`hasSecurePassword(User, "token")`)
- Constructor mass-assignment support

### Translation / Naming

- `humanAttributeName` with i18n lookup and humanize fallback
- `ModelName` with singular, plural, human, collection, element, i18nKey
- `i18nScope` for translation key scoping

## Test breakdown by file

56 files, 963 tests matched to Rails:

| Category                               | Files | Tests |
| -------------------------------------- | ----- | ----- |
| Validations                            | 16    | 334   |
| Core (errors, model, naming, etc.)     | 13    | 295   |
| Types                                  | 13    | 62    |
| Attributes & dirty tracking            | 8     | 160   |
| Serialization                          | 3     | 67    |
| Other (railtie, secure_password, etc.) | 3     | 49    |

5 tests are skipped via `it.skip()` (railtie — Rails-specific initialization hooks with no TS equivalent).

## Dependencies

- `@rails-ts/activesupport` — humanize, deepDup, deepMergeInPlace
- `bcryptjs` — password hashing for SecurePassword
