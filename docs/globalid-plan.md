# GlobalID plan

## Status (2026-05-14)

| PR        | Title                                                          | Status     |
| --------- | -------------------------------------------------------------- | ---------- |
| **GID-0** | Vendor globalid gem source for cross-reference                 | ✅ shipped |
| **GID-1** | Create `packages/globalid` skeleton + delete the lie in AR     | ⏳ next    |
| **GID-2** | `SignedGlobalID` in the new package (over `signedId` verifier) | ⏳         |
| **GID-3** | `URI::GID` parser + `GlobalID` class                           | ⏳         |
| **GID-4** | `GlobalID::Locator` + `findGlobalId` class methods on AR Base  | ⏳         |
| **GID-5** | `Identification` mixin polish + `expiresIn`/purpose            | ⏳         |

**Packaging decision (2026-05-14):** GlobalID ships as a **separate package**
`packages/globalid/`, matching Rails' gem boundary. AR depends on globalid
(one-way); the `Identification` mixin is included onto `Base` from the
globalid side via a side-effect import (same pattern as
`registerMigrationArConfig`). This keeps `Base#findGlobalId` /
`findSignedGlobalId` working without bloating `base.ts`, and unblocks future
ActionCable / ActiveJob ports that need GIDs without an AR dependency.

Globalid source root: `vendor/globalid/lib/` (abbreviated as `$GID/` below).
Pinned to globalid 1.3.0 via `vendor/sources.ts`. Run `pnpm vendor:fetch --source globalid`
once after checkout to populate it.

## Why

`Base#toSgid()` in `packages/activerecord/src/base.ts:2462` claims to produce a
"signed GlobalID-like URI" but actually does plain `btoa(gid)`. Any caller can
forge one. The doc-comment admits this:

```ts
/**
 * Return a signed GlobalID-like URI for this record.
 * Uses a simple base64 encoding (not cryptographically signed).
 */
toSgid(): string {
  const gid = this.toGid();
  if (typeof btoa === "function") {
    return btoa(gid);
  }
  return Buffer.from(gid).toString("base64");
}
```

This is exactly the trap CLAUDE.md warns about: a method that matches a Rails API
surface but doesn't deliver the behavior. Worst case is a downstream user
authenticating off the token. Best case is silent confusion when a Trails-issued
"sgid" can't be verified by Rails-issued infra (or vice versa).

The fix is straightforward because the load-bearing pieces already exist:

- `MessageVerifier` (HMAC-SHA256, URL-safe) — `packages/activesupport/src/message-verifier.ts`
- `signedId` / `findSigned` / `findSignedBang` — `packages/activerecord/src/signed-id.ts`
- `getCrypto()` adapter (webcrypto + node:crypto) — `packages/activesupport/src/crypto-adapter.ts`

GlobalID just needs a URI shape and a Locator on top of these.

## What's currently in the codebase

| Piece                        | Status                                                   | Location                                         |
| ---------------------------- | -------------------------------------------------------- | ------------------------------------------------ |
| `Base#toGid`                 | trivial; no app namespace                                | `packages/activerecord/src/base.ts:2453`         |
| `Base#toSgid`                | **fake — base64 only**                                   | `packages/activerecord/src/base.ts:2462`         |
| `signedId` (HMAC)            | real; tested                                             | `packages/activerecord/src/signed-id.ts`         |
| `findSigned` / `findSigned!` | real; tested                                             | `packages/activerecord/src/signed-id.ts`         |
| `MessageVerifier`            | real; sha256 + url_safe                                  | `packages/activesupport/src/message-verifier.ts` |
| `URI::GID` equivalent        | **missing**                                              | —                                                |
| `GlobalID.parse` / `.find`   | **missing**                                              | —                                                |
| `GlobalID::Locator`          | **missing**                                              | —                                                |
| App namespace config         | **missing** (Rails: `GlobalID.app=`)                     | —                                                |
| Model registry for locator   | **partial** — `Base.descendants()` exists; no name index | `packages/activerecord/src/base.ts`              |

## Rails surface to mirror (globalid 1.3.0)

```
$GID/global_id.rb                  — 83  LOC — GlobalID class + URI delegation
$GID/global_id/global_id.rb        — alias; loads above
$GID/global_id/uri/gid.rb          — 207 LOC — URI::GID parse/build/validate
$GID/global_id/signed_global_id.rb —  87 LOC — SignedGlobalID with verifier + expiry + purpose
$GID/global_id/locator.rb          — 246 LOC — Locator.locate / locate_signed / locate_many / app-scoped locators
$GID/global_id/identification.rb   — 120 LOC — Mixin: to_global_id, to_signed_global_id, to_gid_param, to_sgid_param
$GID/global_id/verifier.rb         —  14 LOC — Wraps MessageVerifier with sha256 digest
$GID/global_id/fixture_set.rb      —  21 LOC — Test fixture support
$GID/global_id/railtie.rb          —  52 LOC — Rails wiring (out of scope)
```

Total ~830 LOC. Realistic TS port lands ~400–500 LOC because the URI and verifier
infrastructure already exists in our packages.

## Migration plan

### GID-0 — Vendor source for cross-reference (~25 LOC, plan-only) ✅ done

- Originally added `scripts/globalid-source/` (Gemfile + bundler fetch script). Superseded by
  the unified vendor system (PR #1552 plan, waves 1–3) — globalid now lives at `vendor/globalid/`,
  cloned from `rails/globalid` at v1.3.0 by `pnpm vendor:fetch --source globalid`. The old
  `scripts/globalid-source/` was deleted in wave 3.
- Plan doc landed.

### GID-1 — Create `packages/globalid` skeleton + delete the lie in AR (~150 LOC)

Stand up the new package and remove the dishonest `toSgid` from AR in a
single shot — this gives every subsequent PR a real home and avoids a brief
intermediate state where AR has bogus methods.

**New package skeleton:**

- `packages/globalid/package.json` — name `@blazetrails/globalid`, deps on
  `@blazetrails/activesupport` (for MessageVerifier), peer-dep on
  `@blazetrails/activerecord` (only used by the Identification mixin and
  Locator; declared peer to avoid the cycle).
- `packages/globalid/tsconfig.json` — same `trails-tsc` setup as siblings.
- `packages/globalid/src/index.ts` — barrel; empty for now (PRs 2–5 fill it).
- `packages/globalid/src/config.ts` — `setApp(name)` / `getApp()` singletons
  (mirrors `GlobalID.app=`). Validates app name against `^[a-zA-Z0-9-]+$`.
- `packages/globalid/dx-tests/` directory placeholder for type-level tests.

**AR-side changes:**

- Delete `Base#toSgid` outright. The base64 fallback was a lie; no callers in
  this repo depend on it (grep confirms it's only referenced in tests).
- Update `Base#toGid` to read app from `@blazetrails/globalid`'s `getApp()`
  via a runtime import. When app is unset, fall back to the existing
  `gid://${ctor.name}/${this.id}` shape — keeps `signed-id.test.ts:289`
  green until GID-5 lands the namespaced form.
- Add the side-effect-import pattern at the bottom of `base.ts`:
  `import "@blazetrails/globalid/wire";` (the wire module is added in later
  PRs as it gets richer — GID-1 just creates an empty stub so the import
  resolves).

**Files touched:** `packages/globalid/*` (new), `packages/activerecord/src/base.ts`,
`packages/activerecord/src/signed-id.test.ts`, root `pnpm-workspace.yaml` if
needed, `tsconfig.references.json` chains.

**Tests:** `packages/globalid/src/config.test.ts` round-trips app
get/set; invalid app names rejected. AR tests stay green.

**Risk:** workspace plumbing — new package needs to land in `pnpm-workspace`,
turbo pipelines if any, and the CI test matrix.

### GID-2 — `SignedGlobalID` in the new package (~150 LOC)

New file `packages/globalid/src/signed-global-id.ts`. Mirrors
`$GID/global_id/signed_global_id.rb`.

The verifier comes from AR's existing `signedIdVerifier(klass)` — globalid
takes it as a parameter rather than importing AR directly. Caller (typically
AR via the wire module) supplies the verifier; globalid stays AR-agnostic
in its own source.

- Reuse `signedIdVerifier(klass)` from `signed-id.ts` — no new secret config,
  no new crypto.
- Payload shape mirrors Rails: `{ "gid": "<uri>", "purpose": "...", "expires_at": "<iso8601>" }`.
  This means the same MessageVerifier secret can verify tokens issued by
  either `signedId` or `SignedGlobalID`, distinguished by their payload shape.
- Implement `SignedGlobalID.create(model, { app, purpose, expiresIn, expiresAt, verifier })`
  → returns a `SignedGlobalID` whose `.toString()` / `.toParam()` is the verifier-signed
  payload.
- Implement `SignedGlobalID.parse(sgid, { purpose, verifier })` →
  returns a `SignedGlobalID` instance or `null` on invalid signature, expired,
  or purpose mismatch (matches Rails' `verify` semantics).
- Wire `Base#toSgid(options?)` to call `SignedGlobalID.create(this, options).toString()`.
  This is the **real** signed GID, replacing the fake from GID-1.

The `verify_with_legacy_self_validated_metadata` path in Rails 1.3.0 (lines
40-60 of `signed_global_id.rb`) is **out of scope** — Trails has no legacy
unverified-metadata SGIDs to read, so we only implement the verifier-validated
path.

- Files: `signed-global-id.ts` (new), `base.ts` (rewire toSgid)
- Tests: `signed-global-id.test.ts` — round-trip, expiration, purpose mismatch,
  tampered token, wrong verifier
- Risk: getting the payload key names exactly right for cross-Rails
  interop ("gid"/"purpose"/"expires_at") — verify against
  `$GID/global_id/signed_global_id.rb` line 67.

### GID-3 — `URI::GID` parser + `GlobalID` class (~120 LOC)

New files `packages/globalid/src/uri-gid.ts` and `packages/globalid/src/global-id.ts`,
mirroring `$GID/global_id/uri/gid.rb` + `$GID/global_id/global_id.rb` —
keep the file split so api:compare picks up Rails-mirroring layout.

- Pure-JS URI parser: extract `app`, `modelName`, `modelId`, `params`. We don't
  need a full `URI::Generic` subclass — a small `parseGid(str)` function
  returning `{ app, modelName, modelId, params }` covers all callers. Validate
  app names against `^[a-zA-Z0-9-]+$` (Rails: `validate_app`).
- `GlobalID.create(model, options)` → uses the configured `app` (from GID-1) or
  the option override; returns a `GlobalID` instance with `.uri`, `.modelName`,
  `.modelId`, `.params`, `.toParam()`, `.toString()`.
- `GlobalID.parse(input)` → accepts `gid://...` strings or already-parsed
  `GlobalID` instances; falls back to base64-decoded form (Rails:
  `parse_encoded_gid`).
- `GlobalID.find(input, options)` → calls `Locator.locate` from GID-4.
- Equality: `gid1.equals(gid2)` if URIs match.

- Files: `global-id.ts` (new)
- Tests: parse roundtrip, equality, base64 param decode, invalid app rejection,
  cross-validation against fixtures from `$GID/test/uri/gid_test.rb`
- Risk: encoded params (`?key=value`) — Rails encodes via URL params; align
  exactly so Rails-issued GIDs round-trip.

### GID-4 — `GlobalID::Locator` + `findGlobalId` class methods (~100 LOC)

New file `packages/globalid/src/locator.ts`. Mirrors `$GID/global_id/locator.rb`.

The locator needs to find a model class from a name. Globalid declares the
locator interface (`{ locate(gid): Promise<T | null>; locateMany(gids): Promise<T[]> }`)
and provides a default implementation that asks a registered model-finder.
AR registers its finder from the wire module — it walks `Base.descendants()`
and builds a name → class map keyed by `ctor.name`.

The `Base.findGlobalId` / `findSignedGlobalId` class methods live in AR
(`packages/activerecord/src/base.ts`), delegating to the globalid locator
they registered with at boot.

The crux: how does the locator find `User` from `gid://app/User/1`?

Rails uses `model_name.constantize` (Ruby's `String#constantize`). TS has no
constantize — we need a model registry. Two options:

1. **Walk `Base.descendants()`.** Already exists. `Base.descendants()` returns
   every class that extends `Base`. Build a name → class map on each lookup
   (cached after first call, invalidated on new descendant registration).
2. **Explicit registration.** `registerGlobalIdModel(klass)` populates a
   registry. Strictly opt-in but breaks Rails parity (Rails models are
   findable by default).

Recommendation: option 1 with a cache. The cache invalidation hook plugs into
`Base`'s subclass-registration path (already exists for STI).

- `Locator.locate(gid, { only })` → parses → finds model class → calls
  `klass.find(id)` → returns instance or `null`.
- `Locator.locateMany(gids, { only, ignoreMissing })` → groups by model class,
  calls `klass.where({ id: ids }).toArray()` once per class for efficiency,
  then re-orders to match input order.
- `Locator.locateSigned(sgid, { for, only })` → parses signed → delegates.
- App-scoped locators (Rails: `Locator.use(app, locator)`) — **out of scope for
  GID-4**, can land as GID-4b if a consumer requests cross-app locator.
- `Base.findGlobalId(input, options)`, `Base.findSignedGlobalId(input, options)`,
  `Base.findSignedGlobalIdBang(input, options)` — class methods on `Base`.

- Files: `global-id-locator.ts` (new), `base.ts` (add class methods)
- Tests: locate by uri string, locate by GID instance, `only:` class filter,
  `ignoreMissing:` semantics, invalid uri returns null
- Risk: STI subclass routing — `gid://app/Manager/1` should find `Manager` (a
  `User` subclass via `inheritanceColumn`), not the wrong class. Match Rails'
  behavior: locator does `Manager.find(1)`, which Rails routes through STI.

### GID-5 — `Identification` mixin polish + ergonomics (~80 LOC)

New file `packages/globalid/src/identification.ts`, mirrors
`$GID/global_id/identification.rb`. Methods are exported as `this`-typed
functions and mixed onto `Base` in the wire module. Most of this is method
aliases and options threading. Net new (on the host that includes the mixin):

- `toGlobalId(options?)` (alias of `toGid`)
- `toSignedGlobalId(options?)` (alias of `toSgid`)
- `toGidParam(options?)` — base64 of toGid().toString(), URL-safe, no padding
- `toSgidParam(options?)` — same as toSgid (already a string token, but Rails
  exposes both names)

Also:

- `setGlobalIdAppDefaultExpiresIn(duration)` — mirrors `SignedGlobalID.expires_in=`.
- Default purpose constant `"default"` matches Rails (line 23 of
  signed_global_id.rb).

- Files: `base.ts`, `signed-global-id.ts`
- Tests: `to_gid_param` roundtrip via `GlobalID.parse(encoded)`; default
  purpose; default expires_in
- Risk: low. This is mostly aliases.

## Browser-compat tie-in

GlobalID/SignedGlobalID inherit `signedId`'s portability:

- `MessageVerifier` already routes through `getCrypto()` (webcrypto in browser,
  `node:crypto` in Node).
- `URI::GID` parsing is pure-JS string work.
- `Base.descendants()` is in-memory.
- `btoa` / `atob` are global in browser and Node ≥18.

No new BC-N PR needed. Add a single line to `docs/browser-compat-plan.md` §6
"Open questions" → "Resolved": _GlobalID/SignedGlobalID port is portable by
construction; no extra adapters required (see `docs/globalid-plan.md`)._

## Out of scope (v1)

- ActionCable / ActiveJob integration. Both gems use GIDs for argument
  serialization; that wires up via the `Identification` mixin once GID-1..5
  land.
- Cross-app locators (`Locator.use(app, locator)`).
- Legacy `verify_with_legacy_self_validated_metadata` path (no Trails-issued
  legacy SGIDs exist).
- Custom URI schemes other than `gid://` (Rails has `sgid://` for some
  contexts; same parser, different scheme bit).

## Open questions

- **App name configuration.** Global singleton (`setGlobalIdApp`) vs
  per-instance config? Rails uses a class-level singleton on `GlobalID`. Match
  it. Multi-tenant scenarios use the `app:` option override per-call.
- **Default expires_in.** Rails default is `nil` (no expiration). Match.
- **Purpose namespace separator.** `signedId` already combines purpose with
  the model name (`combineSignedIdPurposes` in `signed-id.ts`). For
  `SignedGlobalID`, purpose is just the user's `for:` option, no model name
  combining (Rails behavior — verify against
  `signed_global_id.rb:24-27`).
