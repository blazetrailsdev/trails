# ActiveModel: Road to 100%

Current: **304/344 methods (88.4%)**. All 62 files exist. 40 methods remaining.

```bash
pnpm run api:compare -- --package activemodel
pnpm run api:compare -- --package activemodel --missing
```

---

## PR Plan (7 PRs, dependency order)

### PR 1: Type system base (~21 methods)

**Files:** `type/value.ts`, `type.ts`

Add to abstract `Type<T>` base class:

- Constructor: `options?: { precision?: number; scale?: number; limit?: number }`
- Properties: `precision`, `scale`, `limit`
- Methods: `type()`, `isSerializable()`, `typeCastForSchema()`, `isBinary()`, `isChanged()`, `isChangedInPlace()`, `isValueConstructedByMassAssignment()`, `isForceEquality()`, `map()`, `assertValidValue()`, `isSerialized()`, `isMutable()`, `asJson()`

Add to `type.ts` (module-level):

- `registry()`, `register()`, `lookup()`, `defaultValue()`

### PR 2: Concrete type methods (~22 methods)

**Files:** All 11 type files under `type/`

| File                  | Add                                                             |
| --------------------- | --------------------------------------------------------------- |
| `big-integer.ts`      | `serializeCastValue`                                            |
| `binary.ts`           | `type()`, `isBinary()`, `isChangedInPlace()`                    |
| `boolean.ts`          | `type()`, `serializeCastValue`                                  |
| `date-time.ts`        | `type()`                                                        |
| `date.ts`             | `type()`, `typeCastForSchema`                                   |
| `decimal.ts`          | `type()`, `typeCastForSchema`                                   |
| `float.ts`            | `type()`, `typeCastForSchema`                                   |
| `immutable-string.ts` | `constructor`, `type()`, `serializeCastValue`                   |
| `integer.ts`          | `constructor`, `type()`, `serializeCastValue`, `isSerializable` |
| `string.ts`           | `isChangedInPlace`, `toImmutableString`                         |
| `time.ts`             | `type()`, `userInputInTimeZone`                                 |

### PR 3: SerializeCastValue (~3 methods)

**File:** `type/serialize-cast-value.ts`

Add: `constructor`, `included`, `serializeCastValue` on DefaultImplementation

### PR 4: Validators (~22 methods)

**Files:** `validator.ts` + 13 files in `validations/`

Pattern: Add `validateEach()` to each validator (delegates to existing validate logic) and `checkValidityBang()` where needed.

| File              | Add                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------- |
| `validator.ts`    | `checkValidityBang` on EachValidator                                                |
| `validations.ts`  | `context`, `clearValidatorsBang`, `isAttributeMethod`, `inherited`, `validatesBang` |
| `absence.ts`      | `validateEach`, `validatesComparisonOf`, `validatesSizeOf`                          |
| `acceptance.ts`   | `validateEach`                                                                      |
| `clusivity.ts`    | `checkValidityBang`                                                                 |
| `comparison.ts`   | `checkValidityBang`, `validateEach`                                                 |
| `confirmation.ts` | `validateEach`                                                                      |
| `exclusion.ts`    | `validateEach`                                                                      |
| `format.ts`       | `validateEach`, `checkValidityBang`                                                 |
| `inclusion.ts`    | `validateEach`                                                                      |
| `length.ts`       | `checkValidityBang`, `validateEach`                                                 |
| `numericality.ts` | `checkValidityBang`, `validateEach`                                                 |
| `presence.ts`     | `validateEach`                                                                      |

### PR 5: Attribute layer (~32 methods)

**Files:** `attribute-methods.ts`, `attribute-set.ts`, `attribute-set/builder.ts`, `attribute.ts`, `attribute-registration.ts`

`attribute-methods.ts` (16 methods — biggest single file):

- `AttributeMethodPattern`: `proxyTarget`, `parameters` getters
- 14 class methods: `attributeMethodPrefix`, `attributeMethodSuffix`, `attributeMethodAffix`, `aliasAttribute`, `eagerlyGenerateAliasAttributeMethods`, `generateAliasAttributeMethods`, `aliasAttributeMethodDefinition`, `isAttributeAlias`, `attributeAlias`, `defineAttributeMethods`, `defineAttributeMethod`, `defineAttributeMethodPattern`, `undefineAttributeMethods`, `aliasesByAttributeName`

`attribute-set.ts` (5): `castTypes`, `isKey`, `accessed`, `map`, `reverseMergeBang`

`attribute-set/builder.ts` (4): `isKey`, `eachKey`, `marshalDump`, `marshalLoad`

`attribute.ts` (4): `isSerializable`, `typeCast`, `originalValueForDatabase`, `withUserDefault`

`attribute-registration.ts` (3): `decorateAttributes`, `attributeTypes`, `typeForAttribute`

### PR 6: Errors, Dirty, Naming, Lint (~8 methods)

| File        | Add                                 |
| ----------- | ----------------------------------- |
| `errors.ts` | `copyBang`, `mergeBang`             |
| `dirty.ts`  | `initAttributes`, `asJson`          |
| `naming.ts` | `cacheKey`, `extended`              |
| `lint.ts`   | `testModelNaming`, `testErrorsAref` |

### PR 7: Miscellaneous (~14 methods)

| File                                 | Add                                      |
| ------------------------------------ | ---------------------------------------- |
| `deprecator.ts`                      | `deprecator`, `gemVersion`, `version`    |
| `callbacks.ts`                       | `extended`                               |
| `secure-password.ts`                 | `minCost` (ensure detected by extractor) |
| `translation.ts`                     | `raiseOnMissingTranslations`             |
| `attributes.ts`                      | `constructor`, `attributes`              |
| `attribute/user-provided-default.ts` | `marshalDump`, `marshalLoad`             |
| `attribute-set/yaml-encoder.ts`      | `constructor`                            |

---

## Key design decisions

1. **Type base class gets precision/limit/scale** via optional constructor object
2. **Validators keep backward-compat** `validate(record, attr, value, errors)` and add `validateEach` alongside
3. **attribute-methods.ts** adds methods to an `AttributeMethodsRegistry` class managing patterns and aliases
4. **marshalDump/Load** serialize to plain JSON-compatible objects (TS equivalent of Ruby Marshal)
5. **Module hooks** (`extended`, `inherited`) are no-op functions matching Ruby's callback signatures

## Verification

After each PR:

```bash
pnpm run api:compare -- --package activemodel
pnpm vitest run packages/activemodel
```
