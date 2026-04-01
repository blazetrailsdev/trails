# ActiveModel: Road to 100%

Current state: **64.5%** API (222 / 344 methods). **100%** tests (963/963). All 62 files exist.

```bash
pnpm run api:compare -- --package activemodel
pnpm run api:compare -- --package activemodel --missing
```

---

## 19 fully matched files

access, api, attribute assignment, attribute mutation tracker, conversion, error, nested error, serialization, serializers/json, type helpers (5), type/registry, validations (callbacks, comparability, resolve value, with).

## 122 missing methods by category

**Type::Value base (17)** — `type/value.ts` is at 15%. Missing core type casting methods: `cast`, `deserialize`, `serialize`, `isChangedInPlace`, `typeCastForSchema`, `serializeCastValue`, `isBinary`, and more. This is the base class all types inherit from — fixing it cascades everywhere.

**Type subclasses (22)** — `castValue`, `serialize`, `deserialize`, `isChangedInPlace` repeated across date, datetime, decimal, float, integer, string, time, big_integer, boolean, immutable_string, binary. Most are 1-2 methods each that override `Value` base behavior.

**Validators (19)** — `validateEach` (10 occurrences across absence, acceptance, comparison, confirmation, exclusion, format, inclusion, length, numericality, presence) and `checkValidityBang` (6). These are the per-validator hook methods.

**AttributeMethods (16)** — `attribute-methods.ts` at 30%. Missing `aliasAttribute`, `defineAttributeMethods`, method generation infrastructure. This is Ruby's metaprogramming-heavy attribute method definition system.

**Type registry (4)** — `type.ts` at 0%. Missing `register`, `lookup`, `registerLookup` — the global type registration system.

**Validations module (5)** — `validations.ts` at 72%. Missing `validatesEach`, `validatesWith`, `validatesWithBlock` and related.

**AttributeSet (9)** — `attribute-set.ts` (67%) and `attribute-set/builder.ts` (64%). Missing internal attribute set management methods.

**Attribute (4)** — `attribute.ts` at 84%. Missing `withType`, `withValueFromUser`, `withValueFromDatabase`, `withCastValue`.

**Other (26)** — scattered: deprecator (3), errors (2), dirty (2), naming (2), lint (2), callbacks (1), secure_password (1), translation (1), and more.

## Fastest path to 100%

1. **Type::Value** — implement the 17 missing base methods. This is the foundation every type class inherits from.
2. **Validators** — add `validateEach` to each validator (mechanical, 10 methods).
3. **Type subclasses** — override `castValue`/`serialize` per type (mechanical once Value is done).
4. **AttributeMethods** — the metaprogramming infrastructure is the hardest part here.
