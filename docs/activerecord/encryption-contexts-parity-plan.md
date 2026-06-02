# Encryption contexts — Rails parity plan ✅ RESOLVED

**Status: RESOLVED.** The TypeScript encryption-context model now matches Rails'
encryptor-swap mechanics (deleted the invented `encryptionDisabled` /
`protectedMode` flags; the attribute type resolves the encryptor from the
current context). `encryption/contexts.test.ts` was rewritten as a faithful,
DB-backed port of `contexts_test.rb` (9/9, `test:compare` ✓) and dropped from
`eslint/test-fixture-parity-exclude.json`. Shipped across **EC PR 1 (#2805 —
Changes A–F)** and **EC PR 2 (#2825 — test rewrite + exclude removal)**. See
memory `project_encryption_contexts_fixture_parity_blocked`.

This doc is retained only for the one deferred forward-looking follow-up below;
the full implementation plan has been removed.

## Forward-looking follow-up (deferred from EC PR 1)

- **`isEncrypted` / `encrypted?` context divergence (free fix, ~1 line).** Rails'
  `encrypted?` reads the **context** encryptor inside `with_context`
  (`encrypted_attribute_type.rb:48`); under a swapped `NullEncryptor` it returns
  `false`. The TS `isEncrypted` (`encryption/encrypted-attribute-type.ts:128-130`)
  wraps in `this.scheme.withContext(...)` but then reads `this._encryptor`
  directly, ignoring the context the wrapper just pushed. Change A introduced the
  context-resolving `this.encryptor` getter, so the Rails-faithful form is simply
  `this.scheme.withContext(() => this.encryptor.isEncrypted(value))` (swap
  `this._encryptor` → `this.encryptor`). Deferred for scope control: flipping
  `encrypted?` to `false` under a swapped `NullEncryptor` feeds
  `support_unencrypted_data` detection and `EncryptableRecord.isEncryptedAttribute`
  — verify `encrypted-fixtures.test.ts` and `unencrypted-attributes.test.ts` stay
  green before adopting it.
  </content>
