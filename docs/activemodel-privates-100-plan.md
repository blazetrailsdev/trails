# activemodel post-100% follow-up plan

`pnpm api:compare --package activemodel` reached **433/433 (100%)** on
2026-04-29 — that was the public-surface milestone at the time. The
"Current state" totals below are the source of truth after later
Rails-source re-extraction shifted the public denominator to 452.
This doc tracks the remaining follow-up tracks: privates, the small
`test:compare` gap, and the `readAttribute` Rails-parity refactor.

Read the Rails source before each PR. Don't paraphrase from memory.
Per CLAUDE.md: ≤ 300 LOC per PR, draft, branch from `main`, no
subagents, no `Co-Authored-By` lines.

Rails reference: `scripts/api-compare/.rails-source/activemodel/`.

## Current state

```
pnpm api:compare --package activemodel                                        → 451/452 (99.8%)
pnpm tsx scripts/api-compare/compare.ts --privates --package activemodel      → 578/625 (92.5%)
pnpm test:compare --package activemodel                                       → 959/963 (99.6%)
```

> ⚠️ **Don't run `pnpm api:compare --privates …` for the privates view.**
> The `api:compare` script chains four commands with `&&`, and pnpm
> forwards arguments only to the LAST command in the chain (the
> `build-rails-privates-manifest` step). `compare.ts` ends up running
> with no flags (= public-only mode), and the printed numbers come
> from the manifest builder, not from the comparison report. Always
> invoke `compare.ts` directly when you need privates totals.

**Live miss list** — before scoping any PR, run:

```
pnpm tsx scripts/api-compare/compare.ts --privates --package activemodel --missing
```

The per-file miss tables previously embedded in this doc are removed
because they go stale immediately after each merge.

## Already landed (context for new contributors)

- **B1** (#1036) — `castValue` indirection across Type primitives.
- **B2** (#1047) — numeric primitives.
- **B3** (#1054) — date/datetime/timevalue + multiparam.
- **B4** (#1039) — serialization.
- **B5a** (#1064) — `_defineBefore/Around/AfterModelCallback` helpers in
  `callbacks.ts`; `initInternals` exported from `validations.ts` and
  `dirty.ts`; `Model#initInternals()` chains them; `validations.ts` and
  `api.ts` mirror via Rails' include chain.
- **B5b** (#1067) — validation lifecycle helpers: `runValidationsBang`,
  `raiseValidationError`, `contextForValidation` (lazy live view of
  `_validationContext`), `predicateForValidationContext` (cached on:
  predicate), `_mergeAttributes`, `_validatesDefaultKeys`,
  `_parseValidatesOptions`. `Model.isValid` / `validateBang` / `on:`
  gating routed through them. validations.rb at 100%.
- **B7a** — naming (`_singularize`, `i18nKeys`), errors
  (`normalizeArguments` wired into `add` / `where`), error
  (`attributesForHash` consumed by `equals`), lint (`model`,
  `assertBoolean` consumed by the test fns). naming.rb / errors.rb /
  error.rb / lint.rb at 100%.
- **B7b** (#1077) — attribute leaves: `_valueForDatabase` /
  `_originalValueForDatabase` indirection on `Attribute` with
  `FromDatabase` / `FromUser` overrides (FromUser uses the
  `serializeCastValue` fast path); `fetchValue` / `typeCast` helpers
  on `AttributeMutationTracker` (with `ForcedMutationTracker` no-op
  `typeCast` override); `defaultAttribute` on `AttributeSet`.
  attribute.rb / attribute_mutation_tracker.rb / attribute_set.rb at 100%.
- **Track A** (validator privates) — fully merged.

---

## Track B — Privates beyond validators

**Cross-cutting clusters left:**

- **Attribute-method dispatch cluster** (`attribute_methods.rb`,
  `attributes.rb`): `isAttributeMethod`, `matchedAttributeMethod`,
  `missingAttribute`, `_readAttribute`, `resolveAttributeName`.
  Overlaps with **Track D** (the readAttribute/MissingAttributeError
  refactor); land Track D's caller-audit (D0) before scoping these
  further.
- **Attribute-assignment cluster** (`attribute_assignment.rb`,
  `model.rb`, `api.rb`): `_assignAttributes`, `_assignAttribute`,
  `sanitizeForMassAssignment`. Single Rails source (assignment) but
  re-exposed via Validations include chain.

### Remaining PRs

**PR B6 — Attribute method dispatch cluster**
`isAttributeMethod`, `matchedAttributeMethod`, `missingAttribute`,
`_readAttribute`, `_writeAttribute`, `resolveAttributeName` in
`attribute_methods.rb`, `attributes.rb`, `dirty.rb`.
Previously gated on D0; D0 audit confirmed no design dependency —
proceed directly.

**PR B7c — Type / validator leaves**
`maxValue` (`type/big_integer.rb`), `registrations`
(`type/registry.rb`), `prepareValueForValidation` (`validator.rb`),
`_mergeAttributes` (`validations/absence.rb` — also closed transitively
by B5b in some configs; verify against live miss list). ~3 misses.

**PR B8 — Attribute-assignment cluster**
`_assignAttributes`, `_assignAttribute`, `sanitizeForMassAssignment`
in `attribute_assignment.rb` plus the include re-exports on
`model.rb` / `api.rb`. ~7 misses if all variants count.

**PR B9 — Attribute registration cluster**
`applyTo`, `pendingAttributeModifications`, `resetDefaultAttributesBang`,
`resolveAttributeName`, `resolveTypeName`, `hookAttributeType` in
`attribute_registration.rb`. ~6 misses; overlap with Track D worth
checking before scoping.

Re-run the live miss command before scoping each — counts shift as
upstream PRs land.

**Track B target:** activemodel privates 92.5% → ~99%. Final 1% is
non-portable Ruby internals (lifecycle hooks, `method_missing`, etc.)
that should stay in the api-compare skip list.

---

## Track C — `test:compare` push to 100%

Currently 959/963 (99.6%). Only 4 missing tests. C0 investigation done;
2 of 4 are pure test ports (Date `returns correct year`, DateTime `hash
to time`) — trails likely already supports the underlying behavior via
existing multiparameter paths. The other 2 need real implementation:
named-TZ-abbrev parsing in DateTime cast, and a current-zone context
analogous to Rails' `Time.zone` / `Time.use_zone`.

**PR C1 — Port `returns correct year` + `hash to time`**
Pure test additions, one per file. Verify behavior matches before
asserting; if it doesn't, fix the impl in the same PR (these are the
type primitives' multiparameter paths — small code change at most).
Substantially de-risked by B3 (multiparam wired through
`AcceptsMultiparameterTime`).

**PR C2 — Current-zone context + `user input in time zone`**
Add a current-zone slot (AsyncLocalStorage-backed
`Time.currentZone()` analogue or a module-level setter; pick the one
that fits trails' existing time-zone surface). Update
`userInputInTimeZone(value)` to default to it. Port the test name
verbatim.

**PR C3 — Named-TZ-abbrev parsing + `string to time with timezone`**
Extend the DateTime cast string parser to accept zone abbreviations
(EAT, EST, PST, etc.). Source the abbreviation table from the
existing `time-zone.ts` mapping if present; otherwise vendor the
small set Rails uses. Port the test name verbatim.

Order: C1 first (cheap, banks 2/4). C2 before C3 (the
`Time.zone_default` block in C3's test reuses the current-zone
infra C2 introduces).

**Track C target:** test:compare 959/963 → 963/963 (100%).

---

## Track D — `Model#readAttribute` → `MissingAttributeError`

### D0 Audit — completed 2026-05-02

**Scope:** 277 non-test call sites across 57 source files (re-grepped
from main; count grew from 217 as new AR features landed since
2026-04-29).

---

#### Rails semantics clarified

The original framing assumed trails diverges from Rails. The audit
shows this is only half-true:

- **Rails AR `read_attribute`** (`activerecord/lib/.../read.rb:33`):
  calls `@attributes.fetch_value(name, &block)`.
  `AttributeSet#fetch_value` calls `self[name].value(&block)`, and
  `self[name]` for a missing key returns `Attribute.null(name)` — a
  `NullAttribute` whose `.value` is nil. **So Rails AR `read_attribute`
  for a missing attribute → nil, not a raise.**

- **`MissingAttributeError`** is only raised from the
  _generated per-attribute methods_ (`name`, `email`, …). These methods
  pass a block to `_read_attribute` that calls `missing_attribute` when
  the attribute was not loaded (i.e. excluded by a `SELECT` subset).
  Rails AM `_read_attribute` routes through `__send__(attr)` to hit
  that generated method. Trails `_readAttribute` skips the dispatch
  layer and goes straight to the attribute store.

- **Conclusion:** Trails' null-return for `readAttribute` matches Rails
  AR. The divergence comment in `model.ts:readAttribute` is
  misleading — it should say "matches AR, diverges from AM for SELECT
  subsets."

---

#### Call-site categorization

**Category A — Infrastructure reads of always-present columns (raise-safe)**
All `_readAttribute` calls and the vast majority of `readAttribute`
calls. These read PK, FK, timestamp, lock, and explicitly declared
model columns — attributes that are always in the schema. The null
check is purely defensive; in production they never return null.
Examples: all 35 sites in `associations.ts`, all 23 in
`collection-proxy.ts`, all in `attribute-methods/primary-key.ts`,
`composite-primary-key.ts`, `persistence.ts`, `base.ts`, `enum.ts`,
`delegated-type.ts`, `integration.ts`, `locking/optimistic.ts`,
`serialization.ts`, `model.ts`, `attribute-methods.ts`.

**Category B — Nil-return intentional**
Sites that explicitly handle null/nil. The attribute may genuinely be
unset or the caller is defensively handling a new record / partial
load. Examples:

- `base.ts:2445-2451`: `=== null` check for `created_at`/`updated_at`
  on new records before the first `save`.
- `secure-token.ts:59`: `!record.readAttribute(attribute)` — treats
  null as "not yet set".
- `persistence.ts:562`: `if (col && !this._readAttribute(col))`.
- `secure-password.ts` (all 8 sites): digest columns start as null for
  new records; null-return is the expected signal.
- `has-many-through-association.ts:81,155-156,206-207`: uses `?.`
  operator — already nil-safe.
- `confirmation.ts:17`: uses `?.` operator.
- `association.ts:516-521`: cross-object equality check where either
  side may not have the FK set yet.

**Category C — Definition / interface sites (no behavior)**
`model.ts:1327-1347` (the two definitions), `attribute-methods/read.ts`
(interface + AR override), `base.ts:2731,2733` (declare), interface
lines in `core.ts`, `locking/optimistic.ts`, etc.

---

#### Decision: **no change to `readAttribute` semantics**

Rationale:

1. **Trails matches Rails AR today.** Both return nil for missing
   attributes via `fetch_value` → `NullAttribute#value`. There is no
   actual semantic divergence on the AR path that trails users exercise.

2. **The raise path requires partial-column loading.** `MissingAttributeError`
   is meaningful only when a record is loaded with `SELECT a, b` (not
   `SELECT *`) and code tries to read an excluded column. Trails does
   not implement partial-column loading — all records are fully loaded.
   Without that feature, raising on miss would break every Category-B
   caller for no benefit.

3. **All 277 sites are correct as-is.** No caller needs a migrate;
   Category-A callers are raise-safe in practice (columns always
   present), and Category-B callers rely on nil-return by design.

4. **No `tryReadAttribute` needed.** Adding a helper just to have
   parity with a behaviour trails doesn't actually exercise would be
   a signature without behavior (violates CLAUDE.md).

---

#### Follow-up actions (small, not Track D)

- [ ] **Fix the divergence comment** in `model.ts:readAttribute`: change
      "divergence from Rails" to "matches AR; diverges from AM for
      SELECT-subset partial loads, which trails doesn't implement."
- [ ] **Unblock B6**: the attribute-method dispatch cluster
      (`isAttributeMethod`, `matchedAttributeMethod`, `missingAttribute`,
      `_readAttribute`, etc.) does not depend on the raise decision. Remove
      the "gated by Track D" note from B6's entry.

---

#### Track D status: **closed — no migration needed**

The raise-on-missing-attribute behavior belongs to a future
partial-column-loading feature, not to the current privates push.
When/if trails implements `select(:col1, :col2)` style partial loads,
Track D should be reopened as part of that feature's scoping.

Remove PRs D1–Dfinal from the roadmap; they have no target state to
migrate toward.

**Track D target:** Trails `readAttribute` matches Rails' raise
semantics; activemodel divergence comment removed.

---

## Won't fix

**`attribute_missing` eager-dispatch divergence.** TS has no
`method_missing`. Trails routes ALL generated per-attribute methods
through `attributeMissing` so subclass overrides work; Rails only
routes the cold `method_missing` path. Behaviorally equivalent for
override semantics; mechanism mismatch is unavoidable. Comment in
`attributes.ts:defineDirtyAttributeMethods` documents it.

---

## Suggested execution order (remaining)

1. **B6** — attribute-method dispatch cluster (unblocked by D0 audit).
   Closes `attribute_methods.rb`, `attributes.rb`, `dirty.rb` gaps.
   New leaf: **attribute-set/builder.ts** (4 misses:
   `additionalTypes`, `materialize`, `delegateHash`,
   `assignDefaultValue`) — small, independent, scope alongside B6 or
   as B10.
2. **C1** in parallel (cheap, banks 2/4 of test:compare gap).
3. **C2 + C3** as bandwidth allows.
4. Track D is closed — no migration needed (see D0 audit above).
