# ActiveModel API Compare: Road to 100%

Current state: **64.8%** (59/91 classes/modules). Target: 100%.

```bash
pnpm run api:compare -- --package activemodel
```

This plan outlines the steps to reach 100% API parity for ActiveModel, focusing on the 31 missing classes and modules identified by the `api:compare` tool.

---

## Workstream A: Core & Model Layer

These modules define the base behavior of ActiveModel and its integration with other components.

### A1. Attribute & Method Handling (8 missing)

Modules related to how attributes are assigned, registered, and how methods are dynamically handled.

| Rails file                  | Missing | Notes                              |
| --------------------------- | ------- | ---------------------------------- |
| `attribute_assignment.rb`   | 1       | AttributeAssignment module         |
| `attribute_methods.rb`      | 2       | AttributeMethods + related         |
| `attribute_registration.rb` | 1       | AttributeRegistration module       |
| `attributes.rb`             | 1       | Attributes module                  |
| `access.rb`                 | 1       | Access module                      |
| `dirty.rb`                  | 1       | Dirty module (top-level mixin)     |
| `callbacks.rb`              | 1       | Callbacks module (top-level mixin) |

### A2. Model Metadata & Utilities (7 missing)

Naming, translation, and other utility modules.

| Rails file       | Missing | Notes                                 |
| ---------------- | ------- | ------------------------------------- |
| `naming.rb`      | 2       | Naming + related classes              |
| `translation.rb` | 1       | Translation module                    |
| `conversion.rb`  | 1       | Conversion module                     |
| `api.rb`         | 1       | API module                            |
| `deprecator.rb`  | 1       | Deprecator module                     |
| `lint.rb`        | 1       | Lint module (for checking compliance) |

---

## Workstream B: Validations & Serialization

### B1. Validations (6 missing)

Additional validation modules and helpers.

| Rails file                     | Missing | Notes                         |
| ------------------------------ | ------- | ----------------------------- |
| `validations.rb`               | 1       | Top-level Validations module  |
| `validations/absence.rb`       | 1       | Absence validator class       |
| `validations/callbacks.rb`     | 1       | Validations::Callbacks module |
| `validations/clusivity.rb`     | 1       | Clusivity helper module       |
| `validations/comparability.rb` | 1       | Comparability helper module   |
| `validations/resolve_value.rb` | 1       | ResolveValue helper class     |

### B2. Serialization (3 missing)

JSON and general serialization support.

| Rails file            | Missing | Notes                         |
| --------------------- | ------- | ----------------------------- |
| `serialization.rb`    | 1       | Serialization module          |
| `serializers/json.rb` | 1       | JSON serializer module        |
| `secure_password.rb`  | 1       | SecurePassword missing pieces |

---

## Workstream C: Type System Internals

### C1. Type Helpers & Specialized Types (7 missing)

Internal helpers used by the type system.

| Rails file                                    | Missing | Notes                            |
| --------------------------------------------- | ------- | -------------------------------- |
| `type/helpers/mutable.rb`                     | 1       | Mutable helper                   |
| `type/helpers/numeric.rb`                     | 1       | Numeric helper                   |
| `type/helpers/time_value.rb`                  | 1       | TimeValue helper                 |
| `type/helpers/timezone.rb`                    | 1       | Timezone helper                  |
| `type/helpers/accepts_multiparameter_time.rb` | 1       | AcceptsMultiparameterTime helper |
| `type/serialize_cast_value.rb`                | 2       | SerializeCastValue classes       |

---

## Suggested order of attack

1. **Fix misplaced first:**
   - `type/value.ts` → `type.ts` (1 class: `Type`)

2. **A1 & A2 (Core & Utilities):** These are high-visibility modules that complete the base `Model` interface.
3. **B1 (Validations):** Completes the validation suite.
4. **C1 (Type Internals):** Mechanical updates to the type system.
5. **B2 (Serialization):** Final touches on JSON support.

---

## Milestones

| Target        | What it takes                                                    |
| ------------- | ---------------------------------------------------------------- |
| **75%** (~68) | Fix misplaced + A1 (attribute modules) + A2 (naming/translation) |
| **85%** (~77) | + B1 (validations) + B2 (serialization)                          |
| **100%** (91) | + C1 (type helpers) + Remaining minor modules                    |
