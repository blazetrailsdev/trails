/**
 * Shared helpers for DB-backed encryption tests.
 *
 * Mirrors: ActiveRecord::EncryptionTestCase (setup/teardown) and
 *          ActiveRecord::Encryption::EncryptionHelpers (assertions).
 */

import { Temporal } from "@blazetrails/activesupport/temporal";
import { createTestAdapter, type TestDatabaseAdapter } from "../test-adapter.js";
import { defineSchema, type Schema } from "../test-helpers/define-schema.js";
import { Base } from "../index.js";
import type { DatabaseAdapter } from "../adapter.js";

export { Base };
import { Configurable } from "./configurable.js";
import { defaultCompressor, type Compressor } from "./config.js";
import { Contexts } from "./contexts.js";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";
import { clearDefaultKeyProviderCache } from "./scheme.js";
import { withEncryptionContext, withoutEncryption } from "./context.js";
import { DecryptionError, EncryptionError } from "./errors.js";
import { ValueType, BinaryData } from "@blazetrails/activemodel";
// Side-effect: registers encryptionHooks so Base.encrypts() is wired up.
import "../encryption.js";
import type { Encryptor } from "../encryption.js";
import { MessagePackMessageSerializer } from "./message-pack-message-serializer.js";

// JSON array type: cast/serialize produce a JSON string; deserialize parses it back.
// Used as the castType for EncryptedBookWithSerialized*Binary factories.
class _JsonArrayType extends ValueType<unknown> {
  readonly name = "string";
  cast(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  }
  serialize(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    return JSON.stringify(value);
  }
  deserialize(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  }
  type(): string {
    return "string";
  }
}

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

export const AUTHOR_NAME_LIMIT = 100;

// ─── Test adapter factory ─────────────────────────────────────────────────────

/**
 * Tables used by the makeEncrypted* factories below. Defined once so every
 * encryption test gets the same shared schema after a single
 * `installEncryptionSchema(adapter)` call — no per-file duplication.
 *
 * Table names are the AR inflection of each fixture class
 * (e.g. EncryptedBook → encrypted_books). Columns mirror the
 * `this.attribute(...)` calls in each factory; `id` is added by
 * defineSchema's default primary key.
 */
const ENCRYPTION_SCHEMA: Schema = {
  // Columns that hold encrypted ciphertext are declared with limit 1024
  // (Rails uses `t.string :name, limit: 1024` on the shared encrypted_books
  // fixture). Default VARCHAR(255) truncates the JSON-wrapped, base64'd
  // ciphertext on MySQL/MariaDB.
  encrypted_posts: {
    title: { type: "string", limit: 1024 },
    body: { type: "string", limit: 1024 },
  },
  encrypted_books: { name: { type: "string", limit: 1024, default: "<untitled>" } },
  encrypted_book_with_downcase_names: { name: { type: "string", limit: 1024 } },
  encrypted_book_ignore_cases: {
    name: { type: "string", limit: 1024 },
    original_name: { type: "string", limit: 1024 },
  },
  // EncryptedAuthor enforces AUTHOR_NAME_LIMIT at the AR attribute layer
  // (plaintext); the column itself needs room for ciphertext.
  encrypted_authors: { name: { type: "string", limit: 1024 } },
  encrypted_book_with_custom_compressors: { name: { type: "string", limit: 1024 } },
  book_that_will_fail_to_encrypt_names: { name: { type: "string", limit: 1024 } },
  encrypted_traffic_light_with_store_states: { state: "text" },
  // Encrypted binary payloads (ciphertext + IV + auth tag, JSON-wrapped and
  // base64-encoded) exceed VARCHAR(255) — defineSchema maps `binary` →
  // VARCHAR on MySQL, which truncates. Rails' fixture schema uses a single
  // shared `encrypted_books` table with `t.binary :logo` (= BLOB on MySQL);
  // we approximate with `text` to give MariaDB enough room.
  encrypted_book_with_binaries: { logo: "text" },
  encrypted_book_with_serialized_first_binaries: { logo: "text" },
  encrypted_book_with_serialized_second_binaries: { logo: "text" },
  encrypted_book_with_binary_message_pack_serializeds: { logo: "text" },
};

export async function installEncryptionSchema(adapter: DatabaseAdapter): Promise<void> {
  await defineSchema(adapter, ENCRYPTION_SCHEMA);
}

/**
 * Creates a `TestDatabaseAdapter` with the shared encryption schema installed.
 *
 * Two usage patterns:
 *
 * 1. **Per-test (legacy):** call `await freshAdapter()` inside each `it()`.
 *    Spins up a brand-new adapter+schema for every test — slow but isolated.
 *
 * 2. **Transactional fixtures (preferred, B6.4):** call once in `beforeAll`
 *    and wrap with `withTransactionalFixtures(() => adapter)` so each test
 *    runs inside a BEGIN/ROLLBACK pair:
 *
 *    ```ts
 *    let adapter: TestDatabaseAdapter;
 *    beforeAll(async () => { adapter = await freshAdapter(); });
 *    withTransactionalFixtures(() => adapter);
 *    ```
 *
 *    The returned type is `TestDatabaseAdapter` so it satisfies
 *    {@link TransactionalFixturesAdapter} without an extra cast.
 *
 * Caveat: tests that call {@link makeFreshModel} from inside `it()` bodies
 * cannot use pattern (2) on MySQL/MariaDB. `makeFreshModel` runs DDL
 * (`CREATE TABLE`) which auto-commits on MySQL and breaks the outer
 * BEGIN/ROLLBACK wrap — the next `ROLLBACK TO SAVEPOINT` then errors with
 * `SAVEPOINT active_record_1 does not exist`. Keep such tests on pattern (1).
 */
export async function freshAdapter(): Promise<TestDatabaseAdapter> {
  const adapter = createTestAdapter();
  await installEncryptionSchema(adapter);
  return adapter;
}

// ─── Model factories ──────────────────────────────────────────────────────────

/**
 * Creates a fresh model with the given attributes — no pre-applied encryption.
 * Attribute types are passed as strings (e.g. "integer", "string").
 * Use this when you need to apply a specific encryption scheme to an attribute
 * without the idempotency guard blocking a second encrypts() call.
 */
let _freshModelCounter = 0;

export async function makeFreshModel(
  adapter: DatabaseAdapter,
  attributes: Record<string, string>,
): Promise<any> {
  const tableName = `fresh_model_${++_freshModelCounter}`;
  const columns: Schema[string] = {};
  for (const [name, type] of Object.entries(attributes)) {
    if (name === "id") continue; // defineSchema adds id implicitly
    (columns as Record<string, string>)[name] = type;
  }
  await defineSchema(adapter, { [tableName]: columns } as Schema);
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

export function makeEncryptedBookWithCustomCompressor(adapter: DatabaseAdapter) {
  // Delegates actual compression to defaultCompressor (zlib) so the compressed
  // output IS smaller and the path is exercised. inflate adds "[compressed] "
  // prefix so tests can assert the custom compressor was actually called —
  // mirrors Rails' EncryptedBookWithCustomCompressor fixture.
  const customCompressor: Compressor = {
    deflate(data: string): Buffer | Uint8Array {
      return defaultCompressor.deflate(data);
    },
    inflate(data: Buffer | Uint8Array): string {
      return "[compressed] " + defaultCompressor.inflate(data);
    },
  };
  return class EncryptedBookWithCustomCompressor extends Base {
    static {
      this.attribute("id", "integer");
      this.attribute("name", "string");
      this.adapter = adapter;
      this.encrypts("name", { compressor: customCompressor });
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

/**
 * EncryptedTrafficLightWithStoreState: `state` is a JSON store column (encrypted),
 * with `color` exposed as a storeAccessor into it.
 * Mirrors Rails' EncryptedTrafficLightWithStoreState fixture.
 */
export function makeEncryptedTrafficLightWithStoreState(adapter: DatabaseAdapter) {
  return class EncryptedTrafficLightWithStoreState extends Base {
    static {
      this.attribute("id", "integer");
      this.attribute("state", "json");
      this.adapter = adapter;
      this.encrypts("state");
      // storeAccessorFor delegates to EncryptedAttributeType.accessor() which
      // forwards to JsonType.accessor(), so no separate store() call is needed.
      this.storeAccessor("state", { accessors: ["color"] });
    }
  } as any;
}

/**
 * EncryptedBookWithBinary: logo is a binary attribute, encrypted.
 * Mirrors Rails' EncryptedBookWithBinary fixture (book_encrypted.rb).
 */
export function makeEncryptedBookWithBinary(adapter: DatabaseAdapter) {
  return class EncryptedBookWithBinary extends Base {
    static {
      this.attribute("id", "integer");
      this.attribute("logo", "binary");
      this.adapter = adapter;
      this.encrypts("logo");
    }
  } as any;
}

/**
 * EncryptedBookWithSerializedFirstBinary: logo stores an Array via JSON serialization,
 * then encrypted. Mirrors Rails' EncryptedBookWithSerializedFirstBinary fixture.
 */
export function makeEncryptedBookWithSerializedFirstBinary(adapter: DatabaseAdapter) {
  const jsonArrayType = new _JsonArrayType();
  return class EncryptedBookWithSerializedFirstBinary extends Base {
    static {
      this.attribute("id", "integer");
      this.attribute("logo", "string");
      // Replace string type with JSON-array type via the pending queue so
      // _defaultAttributes() uses _JsonArrayType as the castType when encrypts wraps it.
      this.decorateAttributes(["logo"], () => jsonArrayType);
      this.adapter = adapter;
      this.encrypts("logo");
    }
  } as any;
}

/**
 * EncryptedBookWithSerializedSecondBinary: logo stores an Array, encrypted.
 * Mirrors Rails' EncryptedBookWithSerializedSecondBinary fixture.
 * Uses JSON array serialization (YAML is not available in TS; both produce
 * equivalent results for the ASCII-only test data).
 */
export function makeEncryptedBookWithSerializedSecondBinary(adapter: DatabaseAdapter) {
  const jsonArrayType = new _JsonArrayType();
  return class EncryptedBookWithSerializedSecondBinary extends Base {
    static {
      this.attribute("id", "integer");
      this.attribute("logo", "string");
      this.decorateAttributes(["logo"], () => jsonArrayType);
      this.adapter = adapter;
      this.encrypts("logo");
    }
  } as any;
}

/**
 * EncryptedBookWithBinaryMessagePackSerialized: logo is a binary attribute
 * encrypted with a MessagePack message serializer. Mirrors the fixture class
 * defined inline in encryptable_record_message_pack_serialized_test.rb.
 */
export function makeEncryptedBookWithBinaryMessagePackSerialized(adapter: DatabaseAdapter) {
  return class EncryptedBookWithBinaryMessagePackSerialized extends Base {
    static {
      this.attribute("id", "integer");
      this.attribute("logo", "binary");
      this.adapter = adapter;
      this.encrypts("logo", { messageSerializer: new MessagePackMessageSerializer() });
    }
  } as any;
}

/**
 * MsgPackTextBook: a string `name` column encrypted with a MessagePack
 * serializer. Used to assert that text columns reject MessagePack encoding
 * (encrypted_record_message_pack_serialized_test.rb).
 */
export function makeMsgPackTextBook(adapter: DatabaseAdapter) {
  return class MsgPackTextBook extends Base {
    static {
      this._tableName = "encrypted_books";
      this.attribute("id", "integer");
      this.attribute("name", "string");
      this.adapter = adapter;
      this.encrypts("name", { messageSerializer: new MessagePackMessageSerializer() });
    }
  } as any;
}

// ─── Assertion helpers ────────────────────────────────────────────────────────

/**
 * Mirrors Rails' assert_encrypted_attribute.
 * Checks that the actual DB-bound value is ciphertext (≠ plaintext) and
 * that reading the attribute returns the expected plaintext. For persisted
 * records, reloads and re-checks — matching Rails' assert_encrypted_attribute
 * which calls model.reload before the second assertion.
 */
export async function assertEncryptedAttribute(
  model: any,
  attrName: string,
  expectedValue: unknown,
): Promise<void> {
  _assertEncryptedAttributeOnModel(model, attrName, expectedValue);

  if (typeof model.isPersisted === "function" && model.isPersisted()) {
    await model.reload();
    _assertEncryptedAttributeOnModel(model, attrName, expectedValue);
  }
}

function _valuesEqual(readValue: unknown, expectedValue: unknown): boolean {
  if (readValue === expectedValue) return true;
  if (
    readValue instanceof Temporal.Instant &&
    expectedValue instanceof Temporal.Instant &&
    Temporal.Instant.compare(readValue, expectedValue) === 0
  )
    return true;
  if (
    readValue instanceof Temporal.PlainDate &&
    expectedValue instanceof Temporal.PlainDate &&
    Temporal.PlainDate.compare(readValue, expectedValue) === 0
  )
    return true;
  if (
    readValue instanceof Temporal.PlainDateTime &&
    expectedValue instanceof Temporal.PlainDateTime &&
    Temporal.PlainDateTime.compare(readValue, expectedValue) === 0
  )
    return true;
  if (
    readValue instanceof Uint8Array &&
    expectedValue instanceof Uint8Array &&
    readValue.length === expectedValue.length &&
    readValue.every((b, i) => b === (expectedValue as Uint8Array)[i])
  )
    return true;
  if (
    Array.isArray(readValue) &&
    Array.isArray(expectedValue) &&
    JSON.stringify(readValue) === JSON.stringify(expectedValue)
  )
    return true;
  if (
    typeof readValue === "object" &&
    readValue !== null &&
    !Array.isArray(readValue) &&
    typeof expectedValue === "object" &&
    expectedValue !== null &&
    !Array.isArray(expectedValue) &&
    JSON.stringify(readValue) === JSON.stringify(expectedValue)
  )
    return true;
  return false;
}

function _assertEncryptedAttributeOnModel(
  model: any,
  attrName: string,
  expectedValue: unknown,
): void {
  const readValue = model[attrName];
  if (!_valuesEqual(readValue, expectedValue)) {
    throw new Error(
      `assertEncryptedAttribute: expected ${attrName} to equal ` +
        `${JSON.stringify(expectedValue)}, got ${JSON.stringify(readValue)}`,
    );
  }

  // Verify the DB-bound value differs from the plaintext — confirms real encryption.
  if (expectedValue !== null && expectedValue !== undefined) {
    const dbValues = model._attributes.valuesForDatabase();
    const dbValue = dbValues[attrName];
    const type = model._attributes?.getAttribute?.(attrName)?.type;
    const rawSerialized =
      type && typeof (type as any).castType?.serialize === "function"
        ? (type as any).castType.serialize(expectedValue)
        : null;
    const serializedPlaintext = rawSerialized != null ? String(rawSerialized) : null;

    // For binary attributes the DB value is BinaryData (bytes); compare underlying
    // bytes against the serialized plaintext bytes so we catch unencrypted storage.
    const dbBytes =
      dbValue instanceof BinaryData
        ? dbValue.bytes
        : dbValue instanceof Uint8Array
          ? dbValue
          : null;
    const plaintextBytes =
      rawSerialized instanceof BinaryData
        ? rawSerialized.bytes
        : rawSerialized instanceof Uint8Array
          ? rawSerialized
          : null;
    const binaryPlaintextMatch =
      dbBytes !== null &&
      plaintextBytes !== null &&
      dbBytes.length === plaintextBytes.length &&
      dbBytes.every((b, i) => b === (plaintextBytes as Uint8Array)[i]);

    if (
      binaryPlaintextMatch ||
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
