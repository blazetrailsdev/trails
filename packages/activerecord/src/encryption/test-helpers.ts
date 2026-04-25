/**
 * Shared helpers for DB-backed encryption tests.
 *
 * Mirrors: ActiveRecord::EncryptionTestCase (setup/teardown) and
 *          ActiveRecord::Encryption::EncryptionHelpers (assertions).
 */

import { createTestAdapter } from "../test-adapter.js";
import { Base } from "../index.js";
import type { DatabaseAdapter } from "../adapter.js";

export { Base };
import { Configurable } from "./configurable.js";
import { Contexts } from "./contexts.js";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";
import { clearDefaultKeyProviderCache } from "./scheme.js";
import { withEncryptionContext, withoutEncryption } from "./context.js";
import { DecryptionError, EncryptionError } from "./errors.js";
import type { Encryptor } from "../encryption.js";

export { withEncryptionContext, withoutEncryption, DecryptionError, EncryptionError };

// ─── Test key material ────────────────────────────────────────────────────────

// Primary key is used as a PBKDF2 password — any string works.
export const TEST_PRIMARY_KEY = "test-primary-key-for-encryption-suite";
// Deterministic key is used as raw AES key material (base64-encoded 32 bytes).
// "test-deterministic-key-32bytes!!" = exactly 32 bytes, base64-encoded.
export const TEST_DETERMINISTIC_KEY = "dGVzdC1kZXRlcm1pbmlzdGljLWtleS0zMmJ5dGVzISE=";
export const TEST_KEY_DERIVATION_SALT = "test-key-derivation-salt-for-encryption";

// ─── Config snapshot/restore ─────────────────────────────────────────────────

interface ConfigSnapshot {
  primaryKey: string | string[] | undefined;
  deterministicKey: string | undefined;
  keyDerivationSalt: string | undefined;
  supportUnencryptedData: boolean;
  previousSchemes: typeof Configurable.config.previousSchemes;
  forcedEncodingForDeterministicEncryption: string;
  supportSha1ForNonDeterministicEncryption: boolean;
}

export function snapshotEncryptionConfig(): ConfigSnapshot {
  const c = Configurable.config;
  return {
    primaryKey: c.primaryKey,
    deterministicKey: c.deterministicKey,
    keyDerivationSalt: c.keyDerivationSalt,
    supportUnencryptedData: c.supportUnencryptedData,
    previousSchemes: [...c.previousSchemes],
    forcedEncodingForDeterministicEncryption: c.forcedEncodingForDeterministicEncryption,
    supportSha1ForNonDeterministicEncryption: c.supportSha1ForNonDeterministicEncryption,
  };
}

export function restoreEncryptionConfig(snapshot: ConfigSnapshot): void {
  const c = Configurable.config;
  c.primaryKey = snapshot.primaryKey;
  c.deterministicKey = snapshot.deterministicKey;
  c.keyDerivationSalt = snapshot.keyDerivationSalt;
  c.supportUnencryptedData = snapshot.supportUnencryptedData;
  c.previousSchemes = snapshot.previousSchemes;
  c.forcedEncodingForDeterministicEncryption = snapshot.forcedEncodingForDeterministicEncryption;
  c.supportSha1ForNonDeterministicEncryption = snapshot.supportSha1ForNonDeterministicEncryption;
  Contexts.resetDefaultContext();
  // Eagerly clear so the previous test's key material doesn't linger in
  // memory after config reset — the lazy clear on next keyProvider access
  // isn't sufficient when no subsequent access occurs.
  clearDefaultKeyProviderCache();
}

export function configureEncryption(
  overrides: Partial<{
    primaryKey: string;
    deterministicKey: string;
    keyDerivationSalt: string;
    supportUnencryptedData: boolean;
  }> = {},
): void {
  Configurable.configure({
    primaryKey: overrides.primaryKey ?? TEST_PRIMARY_KEY,
    deterministicKey: overrides.deterministicKey ?? TEST_DETERMINISTIC_KEY,
    keyDerivationSalt: overrides.keyDerivationSalt ?? TEST_KEY_DERIVATION_SALT,
  });
  if (overrides.supportUnencryptedData !== undefined) {
    Configurable.config.supportUnencryptedData = overrides.supportUnencryptedData;
  }
}

// ─── Test adapter factory ─────────────────────────────────────────────────────

export function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

// ─── Model factories ──────────────────────────────────────────────────────────

/**
 * Creates a fresh model with the given attributes — no pre-applied encryption.
 * Attribute types are passed as strings (e.g. "integer", "string").
 * Use this when you need to apply a specific encryption scheme to an attribute
 * without the idempotency guard blocking a second encrypts() call.
 */
let _freshModelCounter = 0;

export function makeFreshModel(adapter: DatabaseAdapter, attributes: Record<string, string>): any {
  // Each call gets a unique table name via the counter. The class itself is
  // anonymous (no unique class name), which is fine for test isolation.
  const tableName = `fresh_model_${++_freshModelCounter}`;
  const klass = class extends Base {
    static {
      this._tableName = tableName;
      for (const [name, type] of Object.entries(attributes)) {
        this.attribute(name, type);
      }
      this.adapter = adapter;
    }
  } as any;
  return klass;
}

/**
 * EncryptedPost: title and body are both encrypted (non-deterministic).
 * Mirrors Rails' post_encrypted.rb / EncryptedPost.
 */
export function makeEncryptedPost(adapter: DatabaseAdapter) {
  return class EncryptedPost extends Base {
    static {
      this.attribute("id", "integer");
      this.attribute("title", "string");
      this.attribute("body", "string");
      this.adapter = adapter;
      this.encrypts("title");
      this.encrypts("body");
    }
  } as any;
}

/**
 * EncryptedBook: name is encrypted deterministically.
 * Mirrors Rails' book_encrypted.rb / EncryptedBook.
 */
export function makeEncryptedBook(adapter: DatabaseAdapter) {
  return class EncryptedBook extends Base {
    static {
      this.attribute("id", "integer");
      this.attribute("name", "string", { default: "<untitled>" });
      this.adapter = adapter;
      this.encrypts("name", { deterministic: true });
    }
  } as any;
}

export function makeEncryptedBookWithDowncaseName(adapter: DatabaseAdapter) {
  return class EncryptedBookWithDowncaseName extends Base {
    static {
      this.attribute("id", "integer");
      this.attribute("name", "string");
      this.adapter = adapter;
      this.encrypts("name", { deterministic: true, downcase: true });
    }
  } as any;
}

export function makeEncryptedBookIgnoreCase(adapter: DatabaseAdapter) {
  return class EncryptedBookIgnoreCase extends Base {
    static {
      this.attribute("id", "integer");
      this.attribute("name", "string");
      this.attribute("original_name", "string");
      this.adapter = adapter;
      this.encrypts("name", { deterministic: true, ignoreCase: true });
    }
  } as any;
}

export const AUTHOR_NAME_LIMIT = 100;

export function makeEncryptedAuthor(adapter: DatabaseAdapter) {
  return class EncryptedAuthor extends Base {
    static {
      this.attribute("id", "integer");
      this.attribute("name", "string", { limit: AUTHOR_NAME_LIMIT });
      this.adapter = adapter;
      this.encrypts("name");
    }
  } as any;
}

const _failingEncryptor: Encryptor = {
  encrypt(_value: string): string {
    throw new EncryptionError("deliberate encryption failure");
  },
  decrypt(ciphertext: string): string {
    return ciphertext;
  },
  isEncrypted(_text: string): boolean {
    return false;
  },
};

export function makeBookThatWillFailToEncryptName(adapter: DatabaseAdapter) {
  return class BookThatWillFailToEncryptName extends Base {
    static {
      this.attribute("id", "integer");
      this.attribute("name", "string");
      this.adapter = adapter;
      this.encrypts("name", { encryptor: _failingEncryptor });
    }
  } as any;
}

// ─── Assertion helpers ────────────────────────────────────────────────────────

/**
 * Mirrors Rails' assert_encrypted_attribute.
 * Checks that the actual DB-bound value is ciphertext (≠ plaintext) and
 * that reading the attribute returns the expected plaintext.
 *
 * Uses _attributes.valuesForDatabase() to get the exact value that would
 * be written to the DB, matching what Rails' assert_encrypted_attribute
 * checks via read_attribute_before_type_cast on a persisted record.
 */
export function assertEncryptedAttribute(
  model: any,
  attrName: string,
  expectedValue: unknown,
): void {
  // Verify the attribute reads back as the expected plaintext.
  const readValue = model[attrName];
  const valuesEqual =
    readValue === expectedValue ||
    (readValue instanceof Date &&
      expectedValue instanceof Date &&
      readValue.getTime() === expectedValue.getTime());
  if (!valuesEqual) {
    throw new Error(
      `assertEncryptedAttribute: expected ${attrName} to equal ` +
        `${JSON.stringify(expectedValue)}, got ${JSON.stringify(readValue)}`,
    );
  }

  // Verify the DB-bound value differs from the plaintext — confirms real encryption.
  // For non-string types (e.g. Date), also compare against the serialized string
  // form since dbValue is always a string while expectedValue may be an object.
  if (expectedValue !== null && expectedValue !== undefined) {
    const dbValues = model._attributes.valuesForDatabase();
    const dbValue = dbValues[attrName];
    const type = model._attributes?.getAttribute?.(attrName)?.type;
    const rawSerialized =
      type && typeof (type as any).castType?.serialize === "function"
        ? (type as any).castType.serialize(expectedValue)
        : null;
    // Normalize to string for comparison (EncryptedAttributeType calls String() before encrypting).
    const serializedPlaintext = rawSerialized != null ? String(rawSerialized) : null;
    if (
      dbValue === expectedValue ||
      (serializedPlaintext != null && dbValue === serializedPlaintext)
    ) {
      throw new Error(
        `assertEncryptedAttribute: expected ${attrName} to be encrypted ` +
          `(DB value ≠ plaintext), but valuesForDatabase() returned the plaintext unchanged.`,
      );
    }
  }
}

/**
 * Returns a freshly-serialized (encrypted) form of the attribute's current value.
 *
 * For deterministic encryption, serialize() is idempotent so this equals the
 * stored DB ciphertext — suitable for equality comparisons across records.
 * For non-deterministic encryption, a fresh IV is used each call, so the result
 * differs from what is stored in the DB. Use this only for comparing two
 * freshly-serialized values (e.g., asserting two records produce different
 * ciphertexts), not for reading back the actual persisted ciphertext.
 *
 * Mirrors Rails' model.ciphertext_for(:attr) in spirit, with the caveat that
 * Rails reads the stored value whereas this re-serializes the current attribute.
 */
export function ciphertextFor(model: any, attrName: string): unknown {
  const klass = model.constructor as any;
  const type = klass._attributeDefinitions?.get(attrName)?.type;
  if (type && typeof type.serialize === "function" && typeof type.isEncrypted === "function") {
    const value = model[attrName];
    return type.serialize(value);
  }
  return model.readAttributeBeforeTypeCast(attrName);
}

/**
 * Creates a DerivedSecretKeyProvider from a password using the current config.
 */
export function makeKeyProvider(password: string) {
  return new DerivedSecretKeyProvider(password);
}
