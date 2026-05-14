# activerecord — type audit

Status as of 2026-05-13, after upstream cleanup (arel, activemodel, activesupport, `Errors<TBase>` arc).

Upstream packages are now type-clean; activerecord's remaining numbers reflect its own debt rather than inherited noise.

## Headline numbers

| metric                             | count   |
| ---------------------------------- | ------- |
| `any` (any form)                   | 2603    |
| `as any`                           | ~1800+  |
| `: any` (annotation)               | ~600    |
| `as unknown`                       | 270     |
| `@ts-expect-error`                 | 25      |
| `Record<string, any>`              | 21      |
| `: Function`                       | 48      |
| `this: any` (mixin escape)         | **131** |
| Exported sigs with untyped return  | 26      |
| Exported sigs with `any` somewhere | **381** |

These will not drive to zero — Rails-mirror code has irreducible dynamic patterns. Realistic targets below.

## File leaderboards

### `this: any` (131 total) — top files

| count | file                                                  |
| ----- | ----------------------------------------------------- |
| 49    | `attribute-methods.ts`                                |
| 23    | `autosave-association.ts`                             |
| 12    | `timestamp.ts`                                        |
| 6     | `validations.ts`                                      |
| 5     | `persistence.ts`                                      |
| 5     | `enum.ts`                                             |
| 5     | `associations/builder/singular-association.ts`        |
| 3     | `relation/thenable.ts`                                |
| 3     | `callbacks.ts`                                        |
| 3     | `connection-adapters/abstract/database-statements.ts` |
| 3×    | `associations/builder/*.ts`                           |

### `as any` (~1800 total) — top files

| count | file                                                |
| ----- | --------------------------------------------------- |
| 112   | `relation.ts`                                       |
| 96    | `reflection.ts`                                     |
| 90    | `associations.ts`                                   |
| 85    | `relation/query-methods.ts`                         |
| 56    | `associations/collection-association.ts`            |
| 48    | `base.ts`                                           |
| 46    | `connection-adapters/abstract/schema-statements.ts` |
| 46    | `associations/belongs-to-association.ts`            |
| 42    | `relation/finder-methods.ts`                        |
| 39    | `connection-handling.ts`                            |
| 38    | `associations/preloader/association.ts`             |
| 37    | `transactions.ts`, `nested-attributes.ts`           |
| 36    | `associations/has-one-association.ts`               |
| 35    | `inheritance.ts`                                    |

### `as unknown` (270 total) — top files

| count | file                                              |
| ----- | ------------------------------------------------- |
| 28    | `model-schema.ts`                                 |
| 20    | `connection-adapters/abstract/connection-pool.ts` |
| 19    | `disable-joins-association-relation.ts`           |
| 19    | `associations/collection-proxy.ts`                |
| 11    | `persistence.ts`                                  |
| 10    | `relation/query-methods.ts`                       |
| 10    | `connection-adapters/abstract-adapter.ts`         |
| 8     | `base.ts`, `association-relation.ts`              |

## Pattern taxonomy

Every `any` / `as unknown` in activerecord falls into one of these. They have very different fix profiles.

### P1 — `this: any` mixin escape (FIXABLE — ~131 sites)

The same pattern CLAUDE.md explicitly tells us to avoid. Functions declared as `function foo(this: any, ...)` instead of `function foo(this: ModelHost, ...)`.

**Example** (`attribute-methods.ts:300-331`):

```ts
function attributeMethod(this: any, attrName: string): boolean { ... }
export function attributesWithValues(this: any, attributeNames: string[]): Record<string, unknown> { ... }
```

**Fix**: declare a host interface per file (`AttributeMethodsHost`, `AutosaveHost`, `TimestampHost`) and replace `this: any` with the interface. Same pattern we successfully applied in activemodel's PR #1479.

**Effort**: medium per file. `attribute-methods.ts` is the big one (49 sites, ~150-250 LOC PR alone).

### P2 — Polymorphic reflection (PARTIALLY FIXABLE — ~96 sites in reflection.ts alone)

Reflection inherently doesn't know subclass shapes. Code accesses `(this as any).macro`, `(this as any).joinPrimaryKey`, `(this as any).options.counterCache`.

**Example** (`reflection.ts:100, 130, 139`):

```ts
return (this as any).macro === "hasMany";
const typeCol = (this as any).type;
const primaryKeys = this._arrayWrap((this as any).joinPrimaryKey);
```

**Fix**: discriminated union on `AbstractReflection` with branded `macro` field. High risk because reflection is consumed everywhere — touch this last, or accept the casts as Rails parity tax. Document a `(this as ReflectionWithMacro<"hasMany">)` helper rather than scrubbing.

**Effort**: large + risky. Defer until other categories are done.

### P3 — Hidden private state on `Model` (FIXABLE — ~90 sites in associations.ts + scattered)

Code stores private state as ad-hoc fields on Model instances/classes: `_registryKeys`, `_associations`, `_associationInstances`, `_cachedAssociations`, `_attributesBuilder`, `currentScope`, etc. Accessors use `(record as any)._privateField`.

**Example** (`associations.ts:141-143, 569-580`):

```ts
const keys: string[] = (model as any)._registryKeys ?? [];
(model as any)._registryKeys = keys;
if ((record as any)._cachedAssociations?.has(assocName)) {
  const cached = (record as any)._cachedAssociations.get(assocName) as Base | null;
```

**Fix**: declare these as typed protected/internal fields on `Base` (or on a `ModelInternals` interface that `Base` implements). Replace `as any` accesses with proper typed reads.

**Effort**: medium-high blast radius (every file touching the same private slot needs updating), but mechanical. Bundle by slot — fix `_associations`/`_associationInstances` in one PR, `_cachedAssociations` in another, etc.

### P4 — Mixin host casts (FIXABLE — ~28 sites in model-schema.ts + scattered)

Same pattern as upstream `as unknown as SchemaHost` casts. Mixin functions that need to access fields on `this` cast `this as unknown as SchemaHost` at the call site instead of declaring `this: SchemaHost`.

**Example** (`model-schema.ts:144, 454-455`):

```ts
loadSchema.call(this as unknown as SchemaHost);
const cacheHost = isStiSubclass(this as unknown as typeof Base)
  ? (getStiBase(this as unknown as typeof Base) as unknown as SchemaHost)
  : ...;
```

**Fix**: hoist `this:` annotations into the receiving functions. Same approach as PR #1479 / #1486.

**Effort**: small-medium. `model-schema.ts` alone is ~28 sites — likely fits in one PR.

### P5 — Variadic rest re-spread (FIXABLE — scattered, ~50 sites)

TypeScript can't preserve rest-parameter tuple shape across reassignment. Code uses `args as any` to spread back through.

**Example** (`relation.ts:830, 949`):

```ts
return this._clone().orderBang(...(args as any));
return this._clone().reorderBang(...(args as any));
```

**Fix**: same overload technique used in the recent `normalizes()` fix (#1482). Declare overloads on the receiving method so the call doesn't need a cast.

**Effort**: small. Pure mechanical work, low risk.

### P6 — Cross-package boundary casts (LEGITIMATE — ~50 sites)

Casts at the activerecord/activemodel boundary or activerecord/arel boundary where structural typing isn't enough. These are typically `(adapter as unknown as DatabaseAdapterLike)`, `(this as typeof Base)` between AR's own static/instance contexts, etc.

**Fix**: leave alone. Document with `@internal` JSDoc where they're hot paths. The cast is the boundary contract.

### P7 — `: Function` (FIXABLE — 48 sites)

Bare `Function` type instead of a callable signature.

**Fix**: replace with `(...args: never[]) => unknown` or a proper signature. Lint rule `@typescript-eslint/no-unsafe-function-type` would catch and prevent regression.

**Effort**: small per site but spread across many files.

### P8 — `Record<string, any>` (FIXABLE — 21 sites)

Tightenable to `Record<string, unknown>` in almost all cases. The handful of legitimate ones (where `any` is intentional for downstream chaining) deserve `@internal` documentation.

**Effort**: trivial.

### P9 — `@ts-expect-error` (REVIEW — 25 sites)

Each one is a known type-system limitation. Worth auditing: some may have been fixed upstream and the `@ts-expect-error` is now bug-hiding rather than load-bearing.

**Effort**: small audit, possibly small fix.

## Recommended PR batches

Order matters: do the mechanical/low-risk work first, then the structural refactors, then the risky reflection work last.

### Wave 1 — mechanical cleanup (~200 LOC each, low risk)

- **W1a** (#1500 ✅): `: Function` → callable signatures + `Record<string, any>` → `Record<string, unknown>` sweep + enable `no-unsafe-function-type` lint.
- **W1b**: Variadic rest overloads (P5) — start with relation.ts hot paths. (~100 LOC.)
- **W1c**: `@ts-expect-error` audit (P9). CP PR B (#1519) eliminated 11 directives; CP PR C (#1522) closed 3 more and confirmed 5 as permanent suppressions with sharper rationales (load × 2, isNone × 1, delete/destroy × 2 — all genuine CP-vs-Relation semantic divergences that can't be typed away). The residual `@ts-expect-error` count is now small enough that a W1c audit pass is low-leverage — defer indefinitely unless directives multiply.

### Wave 2 — host typing sweep (P1, P4 — biggest count drops)

- **W2a** (#1502 ✅): `attribute-methods.ts` host interface — 49 `this: any` sites.
- **W2b** (#? ✅): `autosave-association.ts` host interface — 23 `this: any` sites.
- **W2c** (#1506 ✅): `timestamp.ts` + `validations.ts` + `persistence.ts` + `enum.ts` host interfaces.
- **W2d+W2e** (#1507 ✅, bundled): `model-schema.ts` + `associations/builder/*.ts`.

After Wave 2: `this: any` count should drop from 131 → ~0; `as unknown` from 270 → ~150. One known `this: any` retained in `CollectionAssociation.defineReaders` (would require circular `Base` import; defer to W3 once helpers get a narrower interface). ~5 LOC of now-redundant `as typeof Base` casts in `attributes.ts` + `persistence.ts` to bundle with next W3 PR.

### Wave 3 — private state declaration (P3)

- **W3a** (#1518 ✅): declared `_associations`, `_registryKeys`, `_associationInstances` as typed internal fields on `Base`. Update all readers.
- **W3b+W3c** (#1524 ✅, bundled): `ReflectionLike` structural interface in `associations.ts` (eliminated 12 `(reflection as any).X` casts) + `scopeForAssociation` declared on `typeof Base` static surface (eliminated 10 `(targetModel as any).X` casts). `associations.ts` `as any` count: 30 → ~4. The remaining 4 are HABTM `Reflection.create` discriminated-union gaps + `errors`-not-on-static-Base casts (sized below).

After Wave 3: `as any` in associations.ts should drop from 90 → ~20.

### Wave 4 — reflection (P2, highest risk)

- **W4**: discriminated union on `AbstractReflection.macro` plus typed helpers. Risk: every reflection consumer in AR. Possibly multi-PR with `<base>` / `<base>b` / `<base>c` split. Defer until Waves 1-3 are clean.

### Deferred / legitimate (P6)

Cross-package boundary casts stay. Add `@internal` to hot paths so the type-audit and TypeDoc know they're intentional.

## Suggested targets after each wave

| after    | `this: any` | `as any` | `as unknown` | `: Function` | exp `any` in sig |
| -------- | ----------- | -------- | ------------ | ------------ | ---------------- |
| baseline | 131         | ~1800    | 270          | 48           | 381              |
| Wave 1   | 131         | ~1750    | 270          | 0            | ~360             |
| Wave 2   | ~5          | ~1700    | ~150         | 0            | ~250             |
| Wave 3   | ~5          | ~900     | ~140         | 0            | ~200             |
| Wave 4   | ~5          | ~400     | ~130         | 0            | ~120             |

Final non-zero counts are the legitimate P6 boundary casts + P2 reflection casts we accept as Rails parity tax.

## Tracking

- Re-run `pnpm tsx scripts/type-audit/audit.ts` after each PR; the `last-run.json` doubles as a trendline.
- Consider committing `last-run.json` snapshots or piping into `stats:sync` so we can chart it.

## Open follow-ups outside this plan

- `Errors<TBase>` PR D — AR `associations/nested-error.ts` typed base, blocked on making `AssociationLike` generic. Fits into Wave 3 naturally (reflection-adjacent private state).
- `Validations` mixin interface tightening (~10 LOC) + `runValidationsBang` parameterization. Fold into W2c.
- activemodel parallel callback types alignment with activesupport's generic callback chain (~30 LOC). Outside AR scope.
- **CP PR B (#1519 ✅)**: Relation Calculations restructured to method-syntax. Actual count was **11 Calculations-shape directives** (5 CP + 5 AR + 1 DJAR), not the "17 of 22" the brief estimated (that count came from a stale doc/grep). All 11 eliminated. Architectural insight: `Included<>` (CallableMethods) in activesupport is structurally tied to property-syntax output — subclass override-as-method always hits the variance trap. Other mixin sites using `Included<>` (e.g., `QueryMethodBangs` on Relation) will hit this if anyone tries to narrow a signature. A future activesupport slot could add an `Included<>`-variant that emits method-syntax.
- **CP PR C (#1522 ✅)**: closed 3 of 8 remaining CP directives (`destroyAll`/`deleteAll` aligned to Rails return-shape, `calculate` overloads added). 5 remain as **permanent suppressions** with sharpened rationales: `load()` ×2 (thenable `T[]` await contract — structural), `isNone` ×1 (CP async count-query vs Relation sync NullRelation-flag — genuine semantic divergence; sync attempt regressed CI), `delete`/`destroy` ×2 (by-record vs by-PK semantics on Rails-shaped names — irreducible). Surfaced a pre-existing gap: `Relation#isNone()` checks only `_isNone` flag while Rails `Relation#none?` is `Enumerable#none?` (fires a query). Worth a follow-up audit of call sites; low priority, internal usage.
- ~5 LOC — Restructure `BiasableQueue` in `packages/activerecord/src/connection-adapters/abstract/connection-pool/queue.ts` so the module passed to `include()` only contains instance methods. Export `BiasedConditionVariable` as a standalone named export instead of bundling it. The `/^[A-Z]/` constant-detection guard added in #1510 currently skips it correctly, but the module shape is a smell.
- ~20 LOC — Type `_canRouteThroughViaAssociationScope` and `_canRouteThroughViaDisableJoinsAssociationScope` with `ReflectionLike | null | undefined`. They use `reflection: unknown` with inline `as { isThroughReflection?: () => boolean }` casts — not `as any` but consistency win. Requires adding `isThroughReflection?`, `isNested?`, `sourceReflection?` to `ReflectionLike`.
- ~15 LOC — `collection-proxy.ts` line ~739: `(ctor as any)._reflectOnAssociation?.()` can drop `as any` now that `Base._reflectOnAssociation` is declared (#1524).
- ~20 LOC — `assocDef.type as any` + `ref as any` in HABTM `Reflection.create`/`addReflection`. Caller synthesizes a macro tag from a string; needs a discriminated-union overload on `Reflection.create` or a typed factory helper.
- ~10 LOC — `(record as any).errors?.add(...)` ×2 in `processDependentAssociations`. `errors` not declared on `Base` static surface; add `ErrorsLike` interface or declare `errors` on Base.
