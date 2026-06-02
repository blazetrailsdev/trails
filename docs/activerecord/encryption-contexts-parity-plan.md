# Encryption contexts — Rails parity plan

**Goal:** Bring the TypeScript encryption-context model to Rails parity so that
`packages/activerecord/src/encryption/contexts.test.ts` can be rewritten as a
faithful, DB-backed port of `vendor/rails/activerecord/test/cases/encryption/contexts_test.rb`
and removed from `eslint/test-fixture-parity-exclude.json`.

**Status:** Blocked — feature work required first (this doc). See memory
`project_encryption_contexts_fixture_parity_blocked`.

---

## 1. Root cause (why the faithful port fails today)

Rails has **no `encryption_disabled` / `protected_mode` flags**. Its context
mechanics are entirely _encryptor-swap + one boolean_ (`frozen_encryption`):

| Rails helper                | what it actually does                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `without_encryption`        | `with_encryption_context(encryptor: NullEncryptor.new)`                                    |
| `protecting_encrypted_data` | `with_encryption_context(encryptor: EncryptingOnlyEncryptor.new, frozen_encryption: true)` |

And the attribute type **resolves the encryptor from the context on every call**
(`vendor/.../encrypted_attribute_type.rb:150`):

```ruby
def encryptor
  ActiveRecord::Encryption.encryptor   # == context.encryptor
end
```

All observable behavior then falls out of which encryptor is in the context:

- `NullEncryptor#decrypt` returns the ciphertext unchanged, `#encrypt` returns
  the cleartext unchanged → reads return ciphertext, writes store plaintext.
- `EncryptingOnlyEncryptor#decrypt` returns ciphertext unchanged (can't decrypt)
  → reads return ciphertext; writes are blocked by the `frozen_encryption`
  validation, not by the encryptor.

The TS port diverged: it invented boolean flags `encryptionDisabled` /
`protectedMode` (`encryption/context.ts`) and the attribute type resolves the
encryptor from the **scheme** (`this._encryptor`), never from the context. The
flags are short-circuited inside `serialize`/`deserialize`. This is why the three
behaviors fail (verified by probe, 2026-06-01):

1. `with_encryption_context(encryptor: NullEncryptor)` is ignored on read —
   `post.reload.title` returns plaintext, not the ciphertext Rails asserts.
2. In "protected" mode `post.encrypt()` throws `Encryption` (not `Configuration`)
   and `post.decrypt()` throws nothing — because `protectingEncryptedData` sets
   `protectedMode`, but the encrypt/decrypt guard checks `frozenEncryption`.
3. Protected-mode `update` throws `EncryptionError "Can't write encrypted
attribute in protected mode"` instead of Rails' `RecordInvalid`.

The fix is to **delete the flags and adopt Rails' encryptor-swap model.**

---

## 2. Exact changes

Order matters — each step is independently testable. File paths are relative to
`packages/activerecord/src/`.

### Change A — resolve the encryptor from the context (the central fix)

**File:** `encryption/encrypted-attribute-type.ts`

The private `decrypt`/`encrypt` text paths use the scheme encryptor
`this._encryptor` directly (the `this._encryptor.decrypt(...)` call at line 239
inside `decryptAsText` — method starts at line 219; the `this._encryptor.encrypt(...)`
and `this._encryptor.isBinary()` calls at lines 315/312 inside `encryptAsText` —
method starts at line 310; and the `private get encryptor()` at line 324). Change
the call sites to read through a getter that resolves the **current context**
encryptor, falling back to the scheme encryptor when no context override is active:

```ts
// replace the `private get encryptor()` body (line 324)
import { getEncryptionContext } from "./context.js";
// ...
private get encryptor(): EncryptorLike {
  // Mirrors Rails EncryptedAttributeType#encryptor → ActiveRecord::Encryption.encryptor.
  // TS default context carries no encryptor, so fall back to the scheme's.
  return (getEncryptionContext().encryptor as EncryptorLike | undefined) ?? this._encryptor;
}
```

Then make `decryptAsText` (line 239) and `encryptAsText` (lines 312/315) call
`this.encryptor.decrypt(...)` / `this.encryptor.encrypt(...)` /
`this.encryptor.isBinary()` instead of `this._encryptor.*`.

**Critical: the `scheme.withContext` wrapper is already in the path — do NOT add
a second one.** Both `decryptAsText` (line 221) and `encryptAsText` (line 311)
already wrap their bodies in `this.scheme.withContext(() => { … })`, exactly
mirroring Rails, where `decrypt_as_text`/`encrypt_as_text` run inside
`with_context` (`encrypted_attribute_type.rb:84,136`) and `with_context` delegates
to `scheme.with_context` (`encrypted_attribute_type.rb:15`). The getter above is
evaluated **inside** that closure, so the scheme's own encryptor (if any) has
already been pushed before `encryptor` resolves. The only change is swapping
`this._encryptor` → `this.encryptor` at the call sites; the wrapper stays.

**Why this produces Rails-correct precedence (incl. override attrs under a
swapped context):** in Rails the default `Context` ships an `Encryptor.new`; in TS
the default context is `{}` and per-attribute encryptors (compressor / custom
encryptor / message serializer) live on the **scheme**. `Scheme#withContext`
(`encryption/scheme.ts:103-109`) pushes the scheme's encryptor onto the context
_only when the scheme has an override_ (`ctx.encryptor = this._encryptor`) —
exactly Rails' `@context_properties.present?` gate (`scheme.rb:70-72`, with the
compressor/`compress:false` case setting `@context_properties[:encryptor]` at
`scheme.rb:32-33`). Walking the cases with the getter resolving inside the
existing wrapper:

- **plain `encrypts :title`, default context** → `scheme.withContext` pushes
  nothing → `getEncryptionContext().encryptor` is `undefined` → falls back to
  `this._encryptor` (scheme default). ✓
- **plain `encrypts :title` under `without_encryption`/`protecting`** →
  `scheme.withContext` pushes nothing → getter reads the outer context encryptor
  (Null/EncryptingOnly). ✓
- **override attr (`encrypts :name, compressor: X`), default context** →
  `scheme.withContext` pushes `{encryptor: schemeEncryptor}` → getter reads it →
  scheme encryptor. ✓
- **override attr under `without_encryption`** (the case finding 1 of the review
  worried inverts) → outer context = `{encryptor: NullEncryptor}`, then
  `scheme.withContext` pushes `{encryptor: schemeEncryptor}` **on top** → getter
  reads top of stack = **scheme encryptor wins**, matching Rails' innermost-context
  precedence. The fallback never sees the NullEncryptor here because the wrapper
  shadows it. ✓

(The earlier review premise — "the serialize/decrypt path does not call
`scheme.withContext` at all" — does not hold against the current source: lines
221 and 311 are the wrappers. No new wrapper is needed.)

### Change B — drop the flag short-circuits in serialize/deserialize

**File:** `encryption/encrypted-attribute-type.ts` (lines 99–115)

Current:

```ts
deserialize(value) {
  if (value == null) return value;
  if (isEncryptionDisabled()) return value;          // DELETE
  if (isProtectedMode()) return value;               // DELETE
  const decrypted = this.decrypt(value);
  return this.castType.deserialize?.(decrypted) ?? decrypted;
}

serialize(value) {
  if (value == null) return null;
  if (isEncryptionDisabled()) return this.castType.serialize?.(value) ?? value;  // DELETE
  if (isProtectedMode() && !this.deterministic) {                                // DELETE
    throw new EncryptionError("Can't write encrypted attribute in protected mode");
  }
  if (this.isSerializeWithOldest()) return this.serializeWithOldest(value);
  return this.serializeWithCurrent(value);
}
```

After: remove all four flag branches. With Change A the encryptor swap produces
the same read results (NullEncryptor/EncryptingOnlyEncryptor return ciphertext on
decrypt; NullEncryptor returns cleartext on encrypt). The protected-mode write is
now blocked by the validation in Change D, **not** by a throw here — matching
Rails (where `protecting_encrypted_data` uses an `EncryptingOnlyEncryptor` that
_can_ encrypt; the write is stopped by `frozen_encryption`).

Remove the now-unused `isEncryptionDisabled, isProtectedMode` import (line 6).

> ⚠️ **Regression watch:** the deleted `isEncryptionDisabled` branch in
> `serialize` returned `castType.serialize(value)` directly; the new path runs
> `serializeWithCurrent` → `NullEncryptor.encrypt(castSerializedString)`. For
> string columns these are identical, but verify binary/JSON columns
> (`encryptable-record.test.ts`, the `*SerializedBinary` factories,
> `encrypting-only-encryptor.test.ts`) still round-trip — the str/Uint8Array
> coercion in `serializeWithCurrent` (lines ~295–303) must produce the same
> stored bytes that the old direct-cast path did.

### Change C — redefine the context helpers to match Rails

**File:** `encryption/context.ts`

```ts
import { NullEncryptor } from "./null-encryptor.js";
import { EncryptingOnlyEncryptor } from "./encrypting-only-encryptor.js";

export function withoutEncryption<T>(fn: () => T): T {
  return withEncryptionContext({ encryptor: new NullEncryptor() }, fn);
}

export function protectingEncryptedData<T>(fn: () => T): T {
  return withEncryptionContext(
    { encryptor: new EncryptingOnlyEncryptor(), frozenEncryption: true },
    fn,
  );
}
```

Remove `encryptionDisabled` and `protectedMode` from the `EncryptionContext`
interface (lines 51–52) and delete the now-dead `isEncryptionDisabled()` /
`isProtectedMode()` exports (lines 117–123). Grep confirms the only non-test
consumers are `context.ts` and `encrypted-attribute-type.ts`, both edited here.

> Watch for an import cycle: `context.ts` → `null-encryptor.ts`/
> `encrypting-only-encryptor.ts` → `encryptor.ts`. If any of those transitively
> import `context.ts`, lazy-`import()` inside the helper bodies (the pattern
> already used in `encrypted-fixtures.test.ts`).

### Change D — wire the frozen-write validation

**File:** `encryption/encryptable-record.ts`

`cantModifyEncryptedAttributesWhenFrozen` (line ~419) already exists but is never
registered. Register it in the `encrypts` setup as a conditional validation,
mirroring `encryptable_record.rb:13`:

```ruby
validate :cant_modify_encrypted_attributes_when_frozen,
  if: -> { has_encrypted_attributes? && ActiveRecord::Encryption.context.frozen_encryption? }
```

Using the activemodel `validate(fn, { if })` API
(`packages/activemodel/src/validations.ts:148`):

```ts
modelClass.validate(
  (record: any) => EncryptableRecord.cantModifyEncryptedAttributesWhenFrozen(record),
  {
    if: () =>
      EncryptableRecord.hasEncryptedAttributes(modelClass) &&
      getEncryptionContext().frozenEncryption === true,
  },
);
```

Register it **once per model** (guard against re-registration when `encrypts` is
called for multiple attributes — see how `validateColumnSize` dedupes via
`_validators`). This makes `post.save()`/`update` in protected mode add an error
on each changed encrypted attribute → the bang variant throws `RecordInvalid`.

> **Registration-locus divergence (intentional, note it):** Rails declares this
> validation **once at concern inclusion** for every `EncryptableRecord`
> (`encryptable_record.rb:13`), relying entirely on the `if:` guard
> (`has_encrypted_attributes?`) to no-op for unencrypted models. The plan instead
> registers it lazily inside `encrypts` setup. Behavior is equivalent because the
> guard is identical, but two things must hold:
>
> 1. **Dedup keys on the model, not the attribute** — a model with N encrypted
>    attributes must register exactly one validator (otherwise an invalid save
>    adds N duplicate errors / runs the callback N times). `validateColumnSize`
>    dedupes per-attribute (correct for _it_, since it's a length validator on each
>    column); this one must dedupe per-model. Use a `WeakSet<modelClass>` or a
>    `static` flag on the class, not `_validators[attr]`.
> 2. **The `if:` closure is evaluated live, per save** (not snapshotted at
>    registration). The context must be read inside the closure at validation
>    time. Verify the activemodel runner invokes `ConditionalOptions.if` on each
>    `validate(context)` call — the `() => … getEncryptionContext().frozenEncryption`
>    form is correct only if the framework doesn't cache the boolean at register
>    time. (Confirm via an activemodel conditional-validation test before relying
>    on it.)

### Change E — confirm encrypt/decrypt raise `Configuration` in protected mode

**File:** `encryption/encryptable-record.ts` — **no code change expected.**

`validateEncryptionAllowed` (line ~380) already throws `ConfigurationError` when
`getEncryptionContext().frozenEncryption` is set, and it runs first inside
`encryptAttributes`/`decryptAttributes`. Once Change C sets
`frozenEncryption: true` in `protectingEncryptedData`, `post.encrypt()` and
`post.decrypt()` both raise `Errors::Configuration` — matching the Rails test.
Add a test assertion only.

### Change F — expose `Configurable.encryptor`

**File:** `encryption/configurable.ts`

The nesting test asserts `ActiveRecord::Encryption.encryptor == encryptor_N`. Add
the delegating getter next to `keyProvider`/`cipher` (line ~25):

```ts
static get encryptor(): unknown {
  return Contexts.context.encryptor;
}
```

(Optional, for full `Context::PROPERTIES` delegation parity: also add
`keyGenerator` / `messageSerializer` getters — not required by this test.)

---

## 3. Rewrite the test (faithful, DB-backed)

**File:** `encryption/contexts.test.ts`

Replace the pure-function/flag assertions with the Rails bodies. Use the handler
suite + canonical models (gold standard: `encryption/encrypted-fixtures.test.ts`):

- `setupHandlerSuite()` + `useHandlerFixtures(["posts"])` to mirror Rails
  `fixtures :posts` (gives the lint rule a real `posts` accessor + transactional
  rollback). `EncryptedPost` (`test-helpers/models/post-encrypted.ts`) is already
  `_tableName = "posts"`.
- `beforeEach`: `configureEncryption()`, `supportUnencryptedData = true`, then
  `const post = await EncryptedPost.create({ title: "Some encrypted post title", body: "Some body" })`;
  capture `titleCiphertext = post.ciphertextFor("title")`.
- Port each Rails body verbatim (do **not** rename tests — CLAUDE.md):
  - `lets you override properties` → `withEncryptionContext({ encryptor: new NullEncryptor() }, …)`, assert `(await post.reload()).title === titleCiphertext`, then `update`, assert `readAttributeBeforeTypeCast("title") === "Some new title"`.
  - `restore … on error` → throw inside the context, `catch`, then
    `assertEncryptedAttribute(await post.reload(), "title", titleCleartext)`.
  - `nested multiple times` → assert `Configurable.encryptor === e1/e2/e3` at each level.
  - `without_encryption won't decrypt …` → `assertNotEncryptedAttribute` after write (**add this helper** to `encryption/test-helpers.ts` — it has `assertEncryptedAttribute` but not the negative).
  - `.without_encryption doesn't raise on binary encoded data` (`contexts_test.rb:64-70`)
    → `withoutEncryption(() => EncryptedBook.create({ name: <binary string> }))`, assert
    it does not throw. **This is the Change-A binary-path verification gate:** post-Change-A,
    `encryptAsText` consults `this.encryptor.isBinary()` on the swapped `NullEncryptor`
    (not the scheme encryptor), and the binary-column guard
    (`encrypted_attribute_type.rb:137-139`) raises only when `isBinary() && !castType.isBinary()`.
    Confirmed: TS `NullEncryptor.isBinary()` returns `false`
    (`null-encryptor.ts:20-22`, mirrors Rails `null_encryptor.rb:20-22` `binary? → false`),
    so the guard is skipped and the assertion stays green. If Change A regressed the
    encryptor to anything binary-capable here, this test would flip.
  - `protecting … don't decrypt` / `allows db-queries on deterministic attributes`
    (use `EncryptedBook.findBy({ name: "Dune" })`).
  - `can't encrypt or decrypt in protected mode` → `expect(post.encrypt()).rejects` / `decrypt()` → `Errors::Configuration` (Change E).
  - `will raise a validation error …` → protected-mode update rejects with
    `RecordInvalid` (Change D). Use the throwing update variant.
- Keep the existing TS-only `defaultContext is visible …` test (no Rails
  counterpart, not in the parity map) — but update it to the encryptor model
  instead of `keyProvider` flags if it references removed APIs.

---

## 4. Verification & sequencing

1. **Per-change unit runs** (do not run the whole suite — CLAUDE.md):
   - `pnpm vitest run packages/activerecord/src/encryption/encrypted-attribute-type.test.ts`
   - `pnpm vitest run packages/activerecord/src/encryption/encryptable-record.test.ts`
   - `pnpm vitest run packages/activerecord/src/encryption/encryptable-record-api.test.ts`
   - `pnpm vitest run packages/activerecord/src/encryption/null-encryptor.test.ts encrypting-only-encryptor.test.ts read-only-null-encryptor.test.ts`
   - `pnpm vitest run packages/activerecord/src/encryption/encrypted-fixtures.test.ts encryption-schemes.test.ts unencrypted-attributes.test.ts`
2. **Regression focus** (Change B/C touch the shared read/write path): the whole
   `encryption/` folder + `encryption.test.ts` + `encryption-hooks.test.ts`. CI
   runs the full suite; locally run the encryption files as a group.
3. **Change-A encryptor-precedence gates** (the cases where wrong precedence would
   surface): the binary test `.without_encryption doesn't raise on binary encoded
data` and `.protecting_encrypted_data allows db-queries on deterministic
attributes`, plus any compressor/custom-encryptor scheme exercised under
   `without_encryption` (`encryptable-record.test.ts`, `encryption-schemes.test.ts`).
   These are the tests that flip if the getter resolves to the wrong encryptor.
4. **Target test:** `pnpm vitest run packages/activerecord/src/encryption/contexts.test.ts` green.
5. **Lint:** `npx eslint packages/activerecord/src/encryption/contexts.test.ts`
   → 0 `blazetrails/test-fixture-parity` errors.
6. **Remove** `"packages/activerecord/src/encryption/contexts.test.ts"` from
   `eslint/test-fixture-parity-exclude.json` (final commit).
7. `pnpm api:compare --package activerecord` (the new `Configurable.encryptor`
   getter and any `@internal` JSDoc the lint rule wants).

## 5. Risks / open questions

- **PR size.** Changes A–F are implementation; the test rewrite + exclude removal
  is separate. Likely two PRs (siblings off `main`, non-overlapping files per
  CLAUDE.md's 500-LOC ceiling): (1) context/encryptor model + behaviors;
  (2) `contexts.test.ts` rewrite + exclude-list removal. PR 2 depends on PR 1
  merging first (it asserts behavior PR 1 ships) — ship sequentially, do **not**
  stack.
- **`isEncrypted` is a _known, pre-existing_ divergence from Rails
  `encrypted?` — flagged, not neutral.** Rails' `encrypted?` reads the **context**
  encryptor inside `with_context` (`encrypted_attribute_type.rb:48`:
  `with_context { encryptor.encrypted? value }`); under a swapped `NullEncryptor`
  it returns `false`. The current TS already diverges: `isEncrypted`
  (`encrypted-attribute-type.ts:128-130`) wraps in `this.scheme.withContext(...)`
  but then reads `this._encryptor` directly, ignoring the context the wrapper just
  pushed. Change A does **not** touch `isEncrypted` (it edits only the
  decrypt/encrypt text paths), so this divergence persists by default. Decision
  for the impl PR: leave it as-is for scope control, but record it explicitly as a
  divergence from `encrypted_attribute_type.rb:48`. Note the **free fix once Change A
  lands**: since Change A introduces the context-resolving `this.encryptor` getter,
  the Rails-faithful form is simply
  `this.scheme.withContext(() => this.encryptor.isEncrypted(value))` (swap
  `this._encryptor` → `this.encryptor`, identical to the decrypt/encrypt edit).
  Defer it only because flipping `encrypted?` to `false` under a swapped
  `NullEncryptor` feeds `support_unencrypted_data` detection and
  `EncryptableRecord.isEncryptedAttribute` — verify `encrypted-fixtures.test.ts`
  and `unencrypted-attributes.test.ts` stay green before adopting it, ideally as a
  follow-up once the context tests pass.
- **`update` vs `update!` semantics.** Confirm the throwing update path raises
  `RecordInvalid` when a `validate` callback adds an error (Change D); if only
  `save!`/`create!` throw, the ported test must use the bang form.
