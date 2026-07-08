/**
 * Canonical encryption test key material — the single source of truth shared by
 * the suite-wide bootstrap (`test-setup-ar.ts`, mirroring Rails'
 * `activerecord/test/cases/helper.rb:98-102`) and the encryption test helpers
 * (`configureEncryption`). Keeping one copy means fixtures encrypted at load
 * and rows written/read across suites always use the same keys.
 *
 * Values are derived via PBKDF2 (primary + deterministic both flow through
 * DerivedSecretKeyProvider), so any non-empty string works; these mirror the
 * intent of Rails' `"test master key"` / `"test deterministic key"` /
 * `"testing key derivation salt"`.
 */

// Primary key is used as a PBKDF2 password — any string works.
export const TEST_PRIMARY_KEY = "test-primary-key-for-encryption-suite";
// Deterministic key is used as a PBKDF2 password for the DeterministicKeyProvider.
export const TEST_DETERMINISTIC_KEY = "dGVzdC1kZXRlcm1pbmlzdGljLWtleS0zMmJ5dGVzISE=";
export const TEST_KEY_DERIVATION_SALT = "test-key-derivation-salt-for-encryption";
