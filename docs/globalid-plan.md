# GlobalID plan

## Status (2026-05-15)

GID-1 through GID-5 all merged. The package is fully functional end-to-end:
URI parsing, GlobalID + SignedGlobalID classes, Locator (locate / locateMany /
locateSigned / locateManySigned), and the Identification mixin (toGlobalId,
toGid, toGidParam, toSignedGlobalId, toSgid, toSgidParam). AR side: Base.toGid /
toSgid / toGlobalId / toGidParam / toSignedGlobalId / findGlobalId /
findSignedGlobalId / findSignedGlobalIdBang.

### Parity scoreboard — **api:compare 100% ✓**

Unportable-surface skip list applied (pattern_matching_test, railtie_test,
module-based `only:`, legacy SGID metadata, cross-class SGID equality,
Ruby-Marshal token shape).

| Signal       | Current              | 100% target | Gap      |
| ------------ | -------------------- | ----------- | -------- |
| api:compare  | **59 / 59 (100%)** ✓ | 59 / 59     | —        |
| test:compare | 104 / 139 (74.8%)    | 139 / 139   | 35 tests |
| files (api)  | **5 / 5** ✓          | 5 / 5       | —        |
| files (test) | **6 / 6** ✓          | 6 / 6       | —        |

Per-file api:compare:

| Ruby file             | Match | Total | %    |
| --------------------- | ----- | ----- | ---- |
| `identification.rb`   | 4     | 4     | 100% |
| `uri/gid.rb`          | 21    | 21    | 100% |
| `signed_global_id.rb` | 16    | 16    | 100% |
| `locator.rb`          | 16    | 16    | 100% |
| `verifier.rb`         | 2     | 2     | 100% |

Per-file test:compare (post-skip):

| Ruby file                       | Match | Total | %    |
| ------------------------------- | ----- | ----- | ---- |
| `verifier_test.rb`              | 2     | 2     | 100% |
| `uri_gid_test.rb`               | 27    | 30    | 90%  |
| `signed_global_id_test.rb`      | 20    | 22    | 91%  |
| `global_identification_test.rb` | 5     | 6     | 83%  |
| `global_locator_test.rb`        | 37    | 53    | 70%  |
| `global_id_test.rb`             | 13    | 26    | 50%  |

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

### GID-8 — `SignedGlobalID` class-level config + verify split — **done**

Added 8 methods on `SignedGlobalID`:

- `verifier` / `verifier=` and `expiresIn` / `expiresIn=` (Rails
  `attr_accessor` — class-level defaults). `SignedGlobalID.create` /
  `parse` now make `verifier:` optional and fall back to the class
  default via `pickVerifier()`; `expires_in` is consulted by
  `pickExpiration()` when no per-call value is provided.
- `pickVerifier(options)` / `pickPurpose(options)` — public class methods
  matching Rails. `pickVerifier` throws if neither option nor class-level
  is set.
- `verify(sgid, options)` — private class method dispatching to
  `verifyWithVerifierValidatedMetadata` then falling back to
  `verifyWithLegacySelfValidatedMetadata` (always returns null — Trails
  has no Rails 1.3.0-era legacy SGIDs; kept for api:compare parity).
- `raiseIfExpired(expiresAt)` — private class method throwing
  `ExpiredMessage` when the ISO 8601 timestamp is in the past. Used by
  the legacy verify path; nominal for our verifier-validated flow.
- New `ExpiredMessage` exception class.

api:compare `signed_global_id.rb`: 50% (8/16) → **100% (16/16)**.
Overall api:compare: 66.1% → **79.7%**.
test:compare `signed_global_id_test.rb`: 17/24 → **20/24** (the 3
class-level expires_in tests now pass via vi.useFakeTimers — the same
js-temporal-polyfill + Date.now mocking pattern GID-6b established).

### GID-9 — Locator class hierarchy + `use(app, locator)` — **done**

Refactored `locator.ts` from a single static-method `Locator` into the
Rails class hierarchy:

- `BaseLocator` class — instance `locate` / `locateMany` plus protected
  `findRecords` / `modelIdIsValid` / `primaryKey`. The existing logic from
  the old top-level `Locator` moved here.
- `UnscopedLocator extends BaseLocator` — wraps lookups in
  `klass.unscoped { ... }` when the model supports it; yields otherwise.
- `BlockLocator` — `constructor(block)` + `locate` / `locateMany` for the
  `Locator.use(app, &block)` form.
- `Locator` (the static facade) — `locate` / `locateMany` now parse the
  GID, run `findAllowed`, look up the per-app locator via `locatorFor`,
  and delegate. New static methods: `defaultLocator` getter/setter,
  `use(app, locator | block)`, `locatorFor`, `findAllowed`,
  `parseAllowed`, `normalizeApp`.

`LocatorModel` interface gained an optional `unscoped` method so
`UnscopedLocator` can call it when present.

api:compare `locator.rb`: 38% (6/16) → **100% (16/16)**.
api:compare overall: 79.7% → **96.6%** — only `verifier.rb` (2
methods) remains.
test:compare `global_locator_test.rb`: 33/59 → **37/59 (63%)** with the
4 new Rails-named tests (`use locator with block`, `use locator with
class`, `app locator is case insensitive`, `locator name cannot have
underscore`). Overall test:compare: 98/158 → **102/158 (64.6%)**.

### GID-10a — Drop `purpose:` option key — **done**

Removed the Trails-only `purpose:` option key from `SignedGlobalIDOptions`,
`ParseOptions`, `LocateSignedOptions`, and `ToSgidOptions`. `for:` is now
the only purpose key (Rails-canonical: `options.fetch :for, DEFAULT_PURPOSE`).
`SignedGlobalID#purpose` (the instance accessor) stays — mirrors Rails'
`attr_reader :purpose`. Internal verifier payload `purpose:` field is wire
format and untouched. Breaking: callers passing `{ purpose: "..." }` must
switch to `{ for: "..." }`.

### GID-10b — Unify `Base.toGid()` to return GlobalID instance — **done**

`Base.toGid()` is now an alias of `Base.toGlobalId()` and returns a
GlobalID instance, matching Rails' `to_gid → to_global_id` alias.
Breaking: callers expecting a URI string need `.toString()` or `.uri`.

### GID-10c — Global `SignedGlobalID.verifier` — **done (shipped in GID-8)**

The class-level `verifier`/`expiresIn` accessors landed with GID-8, providing
the global default that ActionCable/ActiveJob ports can set once at boot.
AR's per-model `signedIdVerifier(klass)` still wins when `Base.toSgid`
passes an explicit verifier.

### GID-11 — `Verifier` wrapper — **done**

New file `packages/globalid/src/verifier.ts` exporting `Verifier`. Mirrors
`GlobalID::Verifier`: SHA-256 digest, URL-safe base64. Implemented as a
wrapper around our existing `MessageVerifier` (which already supports
`url_safe: true`) rather than a subclass — TS private fields make
subclassing MessageVerifier's `encode`/`decode` hooks impractical.

Public surface: `constructor(secret)`, `generate(data, options?)`,
`verified(message, options?)`. Private hooks for api:compare parity:
`encode(buf | string)` → urlsafe base64, `decode(str)` → Buffer
(tolerates both urlsafe and standard forms).

`verifier_test.rb` mirror: 3/4 tests match (`generates URL-safe
messages`, `verifies URL-safe messages`, `verifies non-URL-safe
messages`). The 4th Ruby test asserts an exact Marshal-serialized
token that can't be reproduced because we use JSON serialization;
documented as a permanent skip.

**api:compare verifier.rb: 0% → 100% (2/2). Overall api:compare reaches
100% (59/59).**

### Unportable surface — **applied to skip list**

`scripts/api-compare/unported-files.ts` skips: `pattern_matching_test.rb`,
`railtie_test.rb`, module-based `only:` filters, legacy self-validated SGID
metadata, cross-class SGID equality, and the Ruby-Marshal exact-token
verifier assertion. Reasons live in the skip-list entries.

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
