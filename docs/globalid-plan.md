# GlobalID plan

## Status (2026-05-15)

GID-1 through GID-5 all merged. The package is fully functional end-to-end:
URI parsing, GlobalID + SignedGlobalID classes, Locator (locate / locateMany /
locateSigned / locateManySigned), and the Identification mixin (toGlobalId,
toGid, toGidParam, toSignedGlobalId, toSgid, toSgidParam). AR side: Base.toGid /
toSgid / toGlobalId / toGidParam / toSignedGlobalId / findGlobalId /
findSignedGlobalId / findSignedGlobalIdBang.

### Parity scoreboard (after GID-7)

Targets are **pre-skip** — the unportable-surface skip list (see below)
brings the practical 100% to 56/56 api / 149/149 tests.

| Signal       | Current          | 100% target (pre-skip) | Gap          |
| ------------ | ---------------- | ---------------------- | ------------ |
| api:compare  | 39 / 59 (66.1%)  | 59 / 59                | 20 methods   |
| test:compare | 95 / 158 (60.1%) | 158 / 158              | 63 tests     |
| files (api)  | 4 / 5            | 5 / 5                  | verifier.ts  |
| files (test) | 5 / 8            | 8 / 8                  | 3 test files |

Per-file api:compare:

| Ruby file             | Match | Total | %    |
| --------------------- | ----- | ----- | ---- |
| `identification.rb`   | 4     | 4     | 100% |
| `uri/gid.rb`          | 21    | 21    | 100% |
| `signed_global_id.rb` | 8     | 16    | 50%  |
| `locator.rb`          | 6     | 16    | 38%  |
| `verifier.rb`         | 0     | 2     | 0%   |

Per-file test:compare:

| Ruby file                       | Match | Total | %   |
| ------------------------------- | ----- | ----- | --- |
| `uri_gid_test.rb`               | 27    | 30    | 90% |
| `global_identification_test.rb` | 5     | 6     | 83% |
| `signed_global_id_test.rb`      | 17    | 24    | 71% |
| `global_locator_test.rb`        | 33    | 59    | 56% |
| `global_id_test.rb`             | 13    | 26    | 50% |
| `verifier_test.rb`              | 0     | 4     | 0%  |
| `pattern_matching_test.rb`      | 0     | 2     | 0%  |
| `railtie_test.rb`               | 0     | 7     | 0%  |

Globalid source root: `vendor/globalid/lib/` (abbreviated as `$GID/` below).
Pinned to globalid 1.3.0 via `vendor/sources.ts`.

## Path to 100% — remaining work

~10 PRs (GID-6a/b/c + GID-7..11 with 10a/10b/10c sub-PRs), ordered
cheapest-first. Each stays under the 300 LOC ceiling.

### GID-6 — Test parity sweep (~3 PRs, ~600 LOC total)

Most of the test:compare gap is missing test FILES, not test logic — the
implementations already exist. Ship the mirrored test suites:

**GID-6a** — open in [#1631](https://github.com/blazetrailsdev/trails/pull/1631):

- `uri-gid.test.ts` — 27/30 Ruby tests match by name (90%).
- `global-id.test.ts` — 13/26 match (50%); the remaining 13 are
  `find*`/`finding`/`model class` Ruby tests that depend on
  `GlobalID#find` → Locator. They belong in `global-locator.test.ts`
  (GID-6c) once GID-9 lands the Locator class hierarchy.
- test:compare moved 10 → 55 (6.3% → 34.8%).

**GID-6b** — restructured `signed-global-id.test.ts` to mirror the four
Ruby `*Test` classes (`SignedGlobalIDTest`, `SignedGlobalIDPurposeTest`,
`SignedGlobalIDExpirationTest`, `SignedGlobalIDCustomParamsTest`). Added
minimal impl: `SignedGlobalID#modelId` / `#modelName` / `#params`
getters, `#equals(other)`, `#inspect()`. **17/24** match (71%); the
remaining 7 need `expires_in` class-level config (GID-8), `model_class`
(Locator), `SignedGlobalID.new(uri, options)` constructor form, or are
backwards-compat with legacy self-validated metadata (out of scope).
`verifier.test.ts` ships with GID-11 once a Verifier wrapper exists.

**GID-6c** — open in [#1644](https://github.com/blazetrailsdev/trails/pull/1644); expanded `global-locator.test.ts` to 37 tests across the
GlobalLocatorTest mirror covering `Locator.locate` / `locateMany` /
`locateSigned` / `locateManySigned` with `only:` / `ignoreMissing:` /
`for:` permutations plus subclass, UUID, composite-PK fixture models.
Added the Rails `BaseLocator#model_id_is_valid?` arity check on
`Locator.locate` (modelId arity must match primaryKey arity) — closes
the "locating by a GID URI with a mismatching model_id" Ruby test.
**33/59** match (56%). The 26 remaining Ruby tests need: module-based
`only:` filters (4 tests, TS has no Ruby modules → permanent skip);
eager-loading `includes:` (3 tests, AR feature out of GlobalID scope
→ permanent skip); `Locator.use(app, locator)` per-app locators (~10
tests, **GID-9**); `app locator is case insensitive` / `locator name
cannot have underscore` (**GID-9**); `ScopedRecordLocatingTest`
(model.unscoped block helper, **GID-9**).

### GID-7 — `URI::GID` class wrapping — **done**

Added `URI::GID` class to `packages/globalid/src/uri/gid.ts` wrapping the
existing `parseGid`/`buildGid` standalone functions. Public surface:
`GID.parse(uri)`, `GID.create(app, model, params)`, `GID.build(args)`,
`GID.validateApp(app)` plus instance accessors `app` / `modelName` /
`modelId` / `params` / `toString()` / `deconstructKeys()`. Internal
URI::Generic subclass hooks (`setPath` / `setQuery` / `setParams` /
`checkHost` / `checkPath` / `checkScheme` / `setModelComponents` /
`validateComponent` / `validateModelIdSection` / `validateModelId` /
`parseQueryParams`) implemented as protected nominal stubs that delegate
to the existing functional helpers — kept for api:compare matching and
to preserve the invariants in OO callers.

api:compare `uri/gid.rb`: 10% → **100% (21/21)**. Overall api:compare
32.2% → **66.1%**. `parseGid` / `buildGid` exports remain the public
functional API (used by SignedGlobalID and GlobalID internally + by AR's
`toGid`); the class is the OO veneer on top.

### GID-8 — `SignedGlobalID` class-level config + verify split (~80 LOC)

8 missing methods on `SignedGlobalID`:

- `expiresIn` / `expiresIn=` (class-level default; currently per-call only).
  Mirrors Rails' `SignedGlobalID.expires_in = 1.month` config.
- Refactor existing `verifyToken` helper into the Rails method layout:
  `pickVerifier(options)`, `pickPurpose(options)`,
  `verifyWithVerifierValidatedMetadata`,
  `verifyWithLegacySelfValidatedMetadata`,
  `raiseIfExpired`, `verify` (dispatcher). These are mostly internal
  helpers — exposing them as static methods keeps api:compare happy
  without changing behavior.

### GID-9 — Locator class hierarchy + `use(app, locator)` (~150 LOC)

11 missing methods on `locator.rb`. Implement the three nested Rails
classes:

- `BaseLocator` class with `locate`, `locateMany`, `findRecords`,
  `modelIdIsValid?`, `primaryKey`. Most logic already lives in the
  current top-level `Locator` — refactor into the class hierarchy.
- `UnscopedLocator extends BaseLocator` with `unscoped(modelClass)` helper
  for the `Model.unscoped { ... }` block pattern.
- `BlockLocator` with constructor + `locate` / `locateMany` for the
  `Locator.use(app, &block)` form.
- `Locator.defaultLocator` getter/setter (replaces internal singleton).
- `Locator.use(appName, locator)` — registers per-app locators in a
  `Map<string, BaseLocator | BlockLocator>`. Now in scope.
- `Locator.locatorFor`, `Locator.findAllowed?`, `Locator.parseAllowed`,
  `Locator.normalizeApp` — private helpers extracted from the current
  inline implementation.

This was deferred from GID-4 as "out of scope per plan." Lifting that
restriction is what unlocks the last ~50 test:compare matches in
`global_locator_test.rb`.

### GID-10a — Drop `purpose:` option key (~40 LOC, breaking)

Rails has never accepted `purpose:` as an option key — it only reads `for:`
(`options.fetch :for, DEFAULT_PURPOSE`). `purpose` exists only as the
internal `@purpose` attribute on the SGID instance. GID-2 introduced
`purpose:` as a Trails-only option key; GID-5 added `for:` alongside it.
Match Rails exactly:

- Remove `purpose?: string` from `SignedGlobalIDOptions`, `ParseOptions`,
  `LocateSignedOptions`, `ToSgidOptions`.
- Remove the `options.for ?? options.purpose` fallbacks in
  `SignedGlobalID.create`/`parse` and `Locator.locateSigned` /
  `locateManySigned`.
- `SignedGlobalID#purpose` (the instance accessor) stays — that mirrors
  Rails' `attr_reader :purpose`.
- Breaking change: any caller passing `{ purpose: "login" }` must switch
  to `{ for: "login" }`.

### GID-10b — Unify `Base.toGid()` to return GlobalID instance (~80 LOC, breaking)

Rails has `to_gid` as an alias of `to_global_id`; both return a GlobalID
instance. Trails currently has `toGid()` returning the URI string and
`toGlobalId()` returning the instance — a divergence inherited from GID-1.
Unify:

- `Base.toGid()` returns a GlobalID instance (alias of `Base.toGlobalId()`).
- Audit call sites in tests for `expect(u.toGid()).toBe("gid://...")` and
  rewrite to `.toString()` or `.uri`. Known sites: `signed-id.test.ts`,
  `calculations.test.ts`. AR's `signed-global-id.ts` may inline-use the
  string form — switch to `.toString()`.
- Update CLAUDE.md and any guide docs referencing the string form.

### GID-10c — Global `SignedGlobalID.verifier` (~40 LOC)

Rails has a global `SignedGlobalID.verifier=` setter that ActionCable /
ActiveJob use to issue SGIDs without an AR instance. Add the same:

- New `SignedGlobalID.setVerifier(verifier)` / `getVerifier()` on the class.
- `SignedGlobalID.create(model, options)` defaults `options.verifier` to
  `getVerifier()` when not supplied.
- `Locator.locateSigned(sgid, options)` defaults `options.verifier` to
  `getVerifier()` when not supplied.
- AR's per-model `signedIdVerifier(klass)` path stays — `Base.toSgid`
  still passes the per-model verifier explicitly, overriding the global.
- Cross-package consumers (ActionCable/ActiveJob ports) can now issue
  SGIDs by calling `SignedGlobalID.setVerifier(...)` once at boot.

### GID-11 — `Verifier` wrapper (~30 LOC)

New file `packages/globalid/src/verifier.ts`. Rails has
`GlobalID::Verifier` wrapping `ActiveSupport::MessageVerifier` with
sha256 digest. We use `MessageVerifier` directly today; wrap it:

```ts
export class Verifier {
  constructor(secret: string) { /* sha256 + url_safe MessageVerifier */ }
  /** @internal */ encode(data: unknown): string { ... }
  /** @internal */ decode(token: string): unknown { ... }
}
```

Two private methods (`encode`, `decode`) close out `verifier.rb`. New
test file `verifier.test.ts` (4 tests) closes the test:compare file.

### Unportable surface — accept as gap, add to skip list

Some Ruby methods don't map to TS. Rather than implementing nominal
stubs, add them to `scripts/api-compare/unported-files.ts` so the
denominator shrinks:

- `URI::GID#deconstruct_keys` — Ruby pattern matching only. No TS
  equivalent. Skip.
- `pattern_matching_test.rb` (2 tests) — exercises `deconstruct_keys`.
  Skip the whole file.
- `railtie_test.rb` (7 tests) — exercises Rails::Railtie wiring. We
  have no Railtie analogue in globalid (Trails wires via the `wire.ts`
  side-effect import). Skip the test file; the `railtie.rb` source
  isn't part of api:compare's PACKAGE_DIRS for globalid today.
- `verify_with_legacy_self_validated_metadata` (GID-8) — Rails 1.3.0
  legacy path for SGIDs issued before the verifier-validated form
  existed. Trails has no legacy SGIDs to read; implement as a
  `@nie disposition=skip` stub or skip outright.

After skips: api:compare denominator drops from 59 → 56, test:compare
denominator drops from 158 → 149. 100% becomes 56/56 and 149/149.

## Browser-compat tie-in

Already noted as resolved in `docs/browser-compat-plan.md` §6:
GlobalID/SignedGlobalID port is portable by construction; no extra
adapters required.

## Out of scope (post-1.0)

- ActionCable / ActiveJob integration. Both gems use GIDs for argument
  serialization; ports will use the `Identification` mixin once they
  land.
- Custom URI schemes other than `gid://`.

## Open questions

(All three previously open questions — `purpose:` deprecation, `toGid()`
return type, global SGID verifier — were resolved 2026-05-15 and folded
into the plan as GID-10a, GID-10b, and GID-10c respectively. Each matches
Rails exactly; GID-10a and GID-10b are breaking changes to existing
Trails-only API.)

## Cleanup follow-ups (from PR post-merge findings)

These don't move the 100% needle but improve internals:

- **`base.ts` `loadSgid()` / `loadSignedId()` dynamic-import dance** —
  vestigial from GID-1/2 era. Static imports now proven to work
  (`_GlobalIDCtor`, `_Locator`, `_SignedGlobalIDType`). Drop the dynamic
  loaders, make `toSgid` / `toSgidParam` / `toSignedGlobalId` sync.
  ~50 LOC.
- **`Base._modelsByName` test cleanup hook** — populated by the adapter
  setter, never cleared between tests. Test-adapter should call
  `Base._modelsByName.clear()` in setup. ~10 LOC.
