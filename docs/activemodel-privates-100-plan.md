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
pnpm tsx scripts/api-compare/compare.ts --privates --package activemodel      → 572/625 (91.5%)
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
`_readAttribute`, `_writeAttribute`, `resolveAttributeName`. Defer
until Track D0 lands the readAttribute caller audit — the dispatch
cluster's design depends on whether trails introduces
`tryReadAttribute` or keeps `hasAttribute` guards.

**PR B7b — Attribute leaves**
`_valueForDatabase`, `_originalValueForDatabase` (`attribute.rb`),
`fetchValue`, `typeCast` (`attribute_mutation_tracker.rb`),
`defaultAttribute` (`attribute_set.rb` + `attribute_set/builder.rb`).
~6 misses.

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

**Track B target:** activemodel privates 91.5% → ~99%. Final 1% is
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

The 217-call-site refactor that the post-100% review flagged but kept
out of scope because it's much larger than a cleanup PR.

Rails `attribute_methods.rb:553` raises `MissingAttributeError` via
`missing_attribute(attr_name, stack)`. Trails `Model#readAttribute`
returns `null` for unknown attributes — divergence currently documented
inline in `model.ts:readAttribute`. As of 2026-04-29, ~217 internal
call sites across ~47 files (excluding tests / `dist/` / `.d.ts`)
rely on null-return — re-grep at D0 time, the count drifts.

**PR D0 — Caller audit, no code**
Categorize the 217 sites:

- (a) "definitely defined, raise on miss" → keep `readAttribute`.
- (b) "may be undefined, treat as nil" → switch to
  `hasAttribute(name) ? readAttribute(name) : null` or a new
  `tryReadAttribute(name)` helper.

Decide whether to introduce `tryReadAttribute` or require explicit
`hasAttribute` guards. Rails ActiveRecord overrides `_read_attribute`
to return nil via `@attributes.fetch_value(attr)`; ActiveModel raises.
Pick a stance.

Output: addendum to this doc with per-file caller breakdown + the
helper-vs-guard decision.

**PR D1 — Introduce `tryReadAttribute` (or chosen alternative)**
Pure addition. No behavior change to existing `readAttribute`.

**PR D2…Dn — Migrate callers, file by file or feature cluster**
Probably 4-6 PRs grouped by area: secure-password, validators,
callbacks, dirty tracking, ActiveRecord-side callers, the rest.
Each PR replaces the relevant `readAttribute` calls with the chosen
alternative.

**PR Dfinal — Flip `readAttribute` to raise**
Once all internal callers are migrated, flip the default. Remove the
divergence comment in `model.ts:readAttribute`.

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

1. **B7b + B7c** in parallel (small leaf clusters).
2. **C1** in parallel (cheap, banks 2/4).
3. **B8 / B9** (assignment + attribute-registration).
4. **C2 + C3** as bandwidth allows.
5. **Track D last** — biggest commitment, biggest risk. Don't start
   until B6 has a comfortable cadence so the Model touch surface is
   stable. **B6** itself is gated by D0.
