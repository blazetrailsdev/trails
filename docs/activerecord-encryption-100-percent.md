# ActiveRecord::Encryption: Road to 100%

Current: **12/27 files at 100%**. Overall encryption surface has **29
methods missing across 15 files**.

```bash
# Full encryption status
pnpm run api:compare -- --package activerecord 2>&1 | rg '^  encryption'

# Missing methods per file
pnpm tsx scripts/api-compare/compare.ts --package activerecord --missing
```

Related:

- [ActiveRecord: Road to 100%](./activerecord-100-percent.md) — the broader parent plan.
- [Two-class consolidation](#the-two-class-consolidation-blocker-pr) (§ PR 0 below) — consolidates the two `EncryptedAttributeType` classes so `Base.encrypts()` routes through the Rails-faithful scheme-based implementation. Prerequisite for every PR below, so new scheme-surface behavior doesn't have to be mirrored across both implementations.

## Constraints (non-negotiable)

1. **Keep the door open for browser compat.** All new crypto flows
   through `@blazetrails/activesupport`'s `getCrypto()` /
   `getCryptoAsync()` adapter — **never `node:crypto` directly**. This
   is the only browser-compat guarantee inside the scope of this epic:
   we don't foreclose on a future browser port, but we also don't do
   browser-side work here. Actually shipping to browsers (reference
   adapter, `Buffer` → `Uint8Array` migration, smoke CI) is tracked as
   a follow-up epic — see § "Follow-up: browser port" at the bottom.
2. **Not bundled by default.** Users must `import` from an explicit
   subpath; the root `@blazetrails/activerecord` barrel does NOT pull
   encryption into the default build. Follows the existing pattern for
   `@blazetrails/activesupport/message-verifier`,
   `/message-encryptor`, `/key-generator`, and
   `@blazetrails/activerecord/connection-handling` (all subpath-only
   because they pull in Node-only or heavy dependencies). The
   motivation here is bundle weight and "pay for what you use" — not
   browser compat.
3. **Rails fidelity first.** Every new method mirrors its Rails
   equivalent: same name (camelCased), same signature, same
   public/protected split. Read `encryption/*.rb` in the Rails source
   before implementing anything.
4. **No stubs.** Every method ships with real behavior. A missing
   method is better than one returning `null` to pass api:compare.

## The two-class consolidation (blocker PR)

**This lands first.** The repo currently has two `EncryptedAttributeType`
classes:

- `packages/activerecord/src/encrypted-attribute-type.ts` — simple,
  Encryptor-based (used by `Base.encrypts()`).
- `packages/activerecord/src/encryption/encrypted-attribute-type.ts` —
  Scheme-based, Rails-faithful (used by `EncryptableRecord.encrypts()`,
  but the test suite is currently all `.skip`ped).

Consolidation onto the scheme-based class is the gate because:

- The legacy simple class lives in the root barrel (`index.ts`), so
  reaching the Rails-faithful surface means routing `Base.encrypts` to
  the scheme path.
- Until consolidation, any new scheme-surface method has to be
  mirrored in both classes.

### Consolidation steps (PR 0)

1. **Move `Base.encrypts` to route through `EncryptableRecord.encrypts`**
   (scheme-based). Requires a thin `Scheme`-from-`Encryptor` adapter:
   wrap the incoming simple encrypt/decrypt pair in a stub
   `Scheme` whose `encryptor` is a `NullEncryptor`-derived shim that
   delegates to the provided functions. Two fidelity-preserving details:
   - When no encryptor option is passed, `Base.encrypts(name)` uses the
     globally-configured scheme (already produced by `Scheme.default`),
     so there's nothing to wrap — the shim is only needed for custom
     `{ encryptor }` options.
   - Preserve `defaultEncryptor` as a re-export from the compat path so
     existing user code doesn't break.
2. **Delete `packages/activerecord/src/encrypted-attribute-type.ts`**
   and update `applyColumnsHash` / the model-schema duck-type check to
   hit exactly one `WrappedType` implementor.
3. **Remove the root `index.ts` exports of encryption symbols**
   (`encrypts`, `defaultEncryptor`, `isEncryptedAttribute`,
   `EncryptedAttributeType`, `Encryptor` type). Re-export from a new
   subpath `@blazetrails/activerecord/encryption` instead.
4. **Add the subpath to `packages/activerecord/package.json`**:

   ```json
   "./encryption": {
     "types": "./dist/encryption/index.d.ts",
     "default": "./dist/encryption/index.js"
   },
   "./encryption/*": {
     "types": "./dist/encryption/*.d.ts",
     "default": "./dist/encryption/*.js"
   }
   ```

5. **Migration note in CLAUDE.md** — users now write
   `import { encrypts } from "@blazetrails/activerecord/encryption"`.
6. **Crypto goes through the adapter.** New crypto code calls
   `getCrypto()` / `getCryptoAsync()` from `@blazetrails/activesupport`
   rather than `node:crypto` directly. This is the only browser-compat
   constraint in scope for this epic — we keep the door open without
   doing the browser port here. Existing `Buffer` / unprefixed
   `"zlib"` usage in `config.ts`, `encryptor.ts`, and
   `message-serializer.ts` is left as-is; migrating those plus the
   ESLint rule, reference adapter, and smoke CI are tracked in the
   "Follow-up: browser port" section at the bottom.

**Gate:** PR 0 merges only after `pnpm api:compare` shows no regression
and `pnpm tsc --noEmit` is clean with the subpath-only imports.

## Rails-faithful method gaps (by file)

Ordered by smallest-blast-radius first. Each PR covers one logical
block; aim for ≤ 20 methods per PR per the repo's size limit.

### PR 1 — `binary?` / `isBinary` predicate on every encryptor

**Files, 1 method each:**

- `encryption/null-encryptor.ts`
- `encryption/read-only-null-encryptor.ts` (also `encrypted? → isEncrypted`)
- `encryption/message-serializer.ts`
- `encryption/message-pack-message-serializer.ts`
- `encryption/encryptor.ts`

**Rails behavior:** `binary?` returns `true` when the serializer or
encryptor produces binary output (MessagePack, compressed payloads).
The Scheme and the Message consult it to decide between
`ActiveModel::Type::Binary` vs `ActiveModel::Type::String` casting.

**Implementation:** each class returns the Rails-faithful static
answer (`MessageSerializer#binary? => false`,
`MessagePackMessageSerializer#binary? => true`, etc.). For
`Encryptor#binary?` the answer is `serializer.binary?`. For
`ReadOnlyNullEncryptor#encrypted?` always returns `true` (it fakes a
fully-encrypted-looking state). 6 methods across 5 files.

**Test matrix:** each class's existing `.test.ts` gets a one-liner
asserting the predicate; no new test files.

### PR 2 — `Encryptor` compression surface

**File:** `encryption/encryptor.ts` (3 missing: `compressor`,
`compress?` → `isCompress`, plus `binary?` from PR 1 already).

**Rails behavior:** `Encryptor` gains a `compressor` reader and a
`compress?` predicate that reads `@compress` (passed via
`EncryptorOptions`). When `compress? === true`, `serialize_message`
runs MessagePack output through `compressor.deflate` before
encrypting. Already half-wired — `EncryptorOptions.compress` /
`.compressor` are accepted by the constructor; this PR exposes the
readers and consults them in the message flow. Add a
`LegacyCompressor` backed by `node:zlib`-adapter (via activesupport)
AND a `Uint8ArrayCompressor` (WASM-friendly, no Node deps — uses
`DecompressionStream`/`CompressionStream` when available).

### PR 3 — `Scheme` merge / with_context / compatibility

**File:** `encryption/scheme.ts` (5 missing).

- `support_unencrypted_data?` → `isSupportUnencryptedData` — reads
  `Configurable.config.supportUnencryptedData`.
- `fixed?` → `isFixed` — true when the scheme has a `key:` or
  `keyProvider:` pin (deterministic schemes default to true).
- `merge(other)` — returns a new Scheme with `other`'s non-nil options
  overlaid. Used by `with_context`.
- `with_context(overrides)` — wraps the current context, yields a
  Scheme with overrides applied, restores. Needed by
  `deterministic attributes can be searched`.
- `compatible_with?(other)` → `isCompatibleWith` — two schemes are
  compatible iff their encryption-relevant options
  (`deterministic`, `downcase`, `ignoreCase`, `keyProvider` identity)
  match.

**Rails fidelity hook:** `with_context` must participate in the
`Contexts` thread/async-local stack that's already implemented — don't
introduce a new state store.

### PR 4 — `ExtendedDeterministicQueries` surface

**File:** `encryption/extended-deterministic-queries.ts` (4 missing:
`where`, `exists?` → `isExists`, `scope_for_create` → `scopeForCreate`,
`find_by` → `findBy`).

**Rails behavior:** monkey-patches Relation/Base so queries on
deterministic-encrypted attributes encrypt the LHS before comparing.
Rails' implementation hooks `where`, `find_by`, `exists?`, and
`scope_for_create` and rewrites scalar / hash conditions through the
encrypted attribute's `serialize`.

**Implementation:** matches our existing `Extension` pattern —
`extendedDeterministicQueries` already exists as a relation-side
extender with `processOrder` / `processWhere`. Add the four new
entries that mirror Rails' equivalent method signatures, and wire them
into the `Relation.prototype`-extender registry.

**Test:** an end-to-end round-trip: migrate with an encrypted column,
`Model.where(email: "x@y")` issues a query against the ciphertext.
Skipped Rails tests in `encryptable-record.test.ts` unskip
incrementally as this PR lands.

### PR 5 — `ExtendedDeterministicUniquenessValidator#validate_each`

**File:** `encryption/extended-deterministic-uniqueness-validator.ts`
(1 missing). Wraps the standard `UniquenessValidator#validate_each` so
a `uniqueness:` validator on an encrypted deterministic column
compares against encrypted ciphertext instead of plaintext.

**Rails fidelity hook:** requires the custom class to extend
`ActiveRecord::Validations::UniquenessValidator` — verify our
uniqueness validator's `protected` hook points match Rails' before
overriding.

### PR 6 — `KeyGenerator.hashDigestClass` + `deriveKeyFrom`

**File:** `encryption/key-generator.ts` (2 missing). Both are thin:

- `hashDigestClass` reads from `Configurable.config.hashDigestClass`
  (default `"sha256"`; user-settable in config).
- `deriveKeyFrom(password, salt, keyLength)` wraps `pbkdf2` via the
  crypto adapter. Already partially wired — this PR promotes it to a
  public method and adds the config reader.

### PR 7 — `Properties.validateValueType`

**File:** `encryption/properties.ts` (1 missing). Ruby raises
`ArgumentError` when writing a non-scalar into a Properties map; our
port must match (throw `InvalidEncryptionProperties` from `errors.ts`).

### PR 8 — `EnvelopeEncryptionKeyProvider.activePrimaryKey`

**File:** `encryption/envelope-encryption-key-provider.ts` (1 missing).
Returns the primary key currently used for envelope encryption.
Mirrors Rails' `active_primary_key` reader, which wraps
`config.primary_key`.

### PR 9 — `EncryptableRecord.sourceAttributeFromPreservedAttribute`

**File:** `encryption/encryptable-record.ts` (1 missing). Rails uses
this to translate a `preserved_original_email` back to `email` when
rotating keys and writing both attributes. Straight string
manipulation — strips the configured preserved-attribute prefix.

### PR 10 — `Context` constructor + key_provider reader

**File:** `encryption/context.ts` (2 missing: constructor that captures
initial state, and the `keyProvider` reader). Touches the ambient
context that `Contexts` pushes/pops. Rails' `Context` has:

```ruby
attr_accessor :key_provider, :frozen_encryption, :key_rotation,
  :cleanup_contexts, :exception, :protected_mode_exception
```

Add the constructor + `keyProvider` getter; the other accessors likely
already exist but should be re-audited.

### PR 11 — `EncryptedFixtures` constructor

**File:** `encryption/encrypted-fixtures.ts` (1 missing). Small class
that encrypts fixture data so test suites loading encrypted models
don't need a separate seed step. Constructor accepts a collection of
fixtures, encrypts every attribute marked in
`EncryptableRecord.encryptedAttributes`. Currently a stub file — needs
real behavior or should be removed from the layout until a testing
integration uses it.

### PR 12 — Root `Encryption` module surface

**File:** `encryption.ts` (3 missing: `key_length` → `keyLength`,
`iv_length` → `ivLength`, `eager_load!` → `eagerLoadBang`).

**After consolidation (PR 0)** this file is a thin re-export module,
not the actual encryption logic. Those three methods re-export from
`Cipher` (key/iv length constants) and wire an `eagerLoadBang` that
eagerly constructs the default scheme/cipher so boot-time errors
surface early.

## Follow-up: browser port

Out of scope for this epic — tracked here so the work is sequenced
and the adapter indirection that lands in this series doesn't get
undone. A future epic should:

- Add a Vitest browser config (`vitest.browser.config.ts` at repo
  root, `@vitest/browser` or `jsdom`) with a resolver that fails the
  bundle on any Node builtin import, prefixed or unprefixed.
- Add a `Browser Smoke — Encryption` CI job that runs that config
  over `packages/activerecord/src/encryption/**`.
- Migrate `Buffer` usage in `encryptor.ts`, `config.ts`, and
  `message-serializer.ts` to `Uint8Array` + the `base64` / `utf-8`
  helpers in `@blazetrails/activesupport`.
- Replace unprefixed `"zlib"` in `config.ts` with a
  `CompressionStream` / `DecompressionStream` path for browsers
  (keep the Node path behind an adapter).
- Ship a reference browser crypto adapter — e.g.
  `@blazetrails/activesupport/crypto-adapter-noble` wrapping
  `@noble/ciphers` + `SubtleCrypto` — opt-in via
  `cryptoAdapterConfig.adapter = "noble"`.
- Add an ESLint rule forbidding Node builtin imports (prefixed and
  unprefixed) and the `Buffer` / `process` globals across
  `packages/activerecord/src/encryption/**`.

The in-epic adapter-only rule (constraint #1 above) ensures no new
`node:crypto` calls land in the meantime.

## Rails test mirror (unskip-as-you-go)

Each encryption test file already contains a block of `it.skip(...)`
placeholders whose names match the Rails encryption test suite
verbatim. Unskip incrementally as backing methods land; **never rename
them** — `pnpm run test:compare` matches tests by their full path
(`describe` chain plus test name), so renaming silently drops the
Rails match. Current skipped counts, highest first:

| File                                                 | Skipped | PR most likely to unskip          |
| ---------------------------------------------------- | ------: | --------------------------------- |
| `encryptable-record.test.ts`                         |      51 | PR 9 + PR 0 wiring                |
| `encryptable-record-api.test.ts`                     |      19 | PR 0 + PR 9                       |
| `encryption-schemes.test.ts`                         |      13 | PR 3                              |
| `extended-deterministic-queries.test.ts`             |      12 | PR 4                              |
| `message-pack-message-serializer.test.ts`            |       7 | PR 1 + PR 2                       |
| `uniqueness-validations.test.ts`                     |       6 | PR 5                              |
| `configurable.test.ts`                               |       6 | PR 3 (via `with_context`)         |
| `encryptor.test.ts`                                  |       3 | PR 1 + PR 2                       |
| `encryptable-record-message-pack-serialized.test.ts` |       3 | PR 2                              |
| `unencrypted-attributes.test.ts`                     |       2 | PR 3 (`isSupportUnencryptedData`) |
| `encrypted-fixtures.test.ts`                         |       2 | PR 11                             |
| `concurrency.test.ts`                                |       1 | PR 3 (`with_context`)             |

That's 125 currently-skipped Rails tests the method work should
progressively light up. A PR that lands a Rails-faithful method
without also unskipping the matching Rails test is incomplete.

## How to work on this

- Each PR is independent (pick any, except PR 0 comes first).
- Work in a worktree. Open a draft PR. Run `/link <pr>` so webhook
  reviews land in the pane.
- **Always read the Rails source** for the method you're implementing
  before writing TypeScript. Copy the semantics, not the Ruby idioms.
- Run `pnpm api:compare -- --package activerecord 2>&1 | rg encryption`
  after each PR to confirm the coverage bump.
- Tests in `packages/activerecord/src/encryption/*.test.ts` contain
  dozens of `it.skip(...)` placeholders that map directly to Rails'
  encryption test suite. Unskip them as the backing methods land; do
  not rename them (`test:compare` matches tests by their full path:
  `describe` chain plus test name).

## Order of operations summary

| PR  | Scope                                               |      Methods | Files |
| --- | --------------------------------------------------- | -----------: | ----: |
| 0   | Consolidate EncryptedAttributeType, move to subpath | — (refactor) |    ~6 |
| 1   | `binary?` / `encrypted?` predicates                 |            6 |     5 |
| 2   | Encryptor compression surface                       |            2 |     1 |
| 3   | Scheme merge / with_context / compatibility         |            5 |     1 |
| 4   | ExtendedDeterministicQueries                        |            4 |     1 |
| 5   | ExtendedDeterministicUniquenessValidator            |            1 |     1 |
| 6   | KeyGenerator hash digest + derive                   |            2 |     1 |
| 7   | Properties.validateValueType                        |            1 |     1 |
| 8   | EnvelopeEncryptionKeyProvider.activePrimaryKey      |            1 |     1 |
| 9   | EncryptableRecord source-attribute translation      |            1 |     1 |
| 10  | Context constructor + keyProvider                   |            2 |     1 |
| 11  | EncryptedFixtures constructor                       |            1 |     1 |
| 12  | Encryption module surface (keyLength, eagerLoad!)   |            3 |     1 |

**Expected end state:** 27/27 encryption files at 100%, overall
activerecord coverage bumps by 29 methods, 125 currently-skipped Rails
encryption tests unskipped, and the default `@blazetrails/activerecord`
bundle loses the encryption weight entirely. Browser support is not
shipped here — see "Follow-up: browser port" above.
