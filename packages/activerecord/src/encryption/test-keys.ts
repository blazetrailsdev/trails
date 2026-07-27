/**
 * Canonical encryption test key material — the single source of truth shared by
 * the suite-wide bootstrap (`cases/helper.ts`, mirroring Rails'
 * `activerecord/test/cases/helper.rb:99-102`) and the encryption test helpers
 * (`configureEncryption`). Keeping one copy means fixtures encrypted at load
 * and rows written/read across suites always use the same keys.
 *
 * Values are the exact Rails test baseline. Both the primary and deterministic
 * keys are consumed as PBKDF2 passwords (via DerivedSecretKeyProvider /
 * DeterministicKeyProvider), so the literal strings work as-is — matching
 * Rails, where the same literals derive the test keys.
 */

export const TEST_PRIMARY_KEY = "test master key";
export const TEST_DETERMINISTIC_KEY = "test deterministic key";
export const TEST_KEY_DERIVATION_SALT = "testing key derivation salt";
