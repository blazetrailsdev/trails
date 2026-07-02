/**
 * Shared helpers for DB-backed encryption tests.
 *
 * Mirrors: ActiveRecord::EncryptionTestCase (setup/teardown) and
 *          ActiveRecord::Encryption::EncryptionHelpers (assertions).
 */

import { Temporal } from "@blazetrails/activesupport/temporal";
import { createTestAdapter, type TestDatabaseAdapter } from "../test-adapter.js";
import { defineSchema, type Schema } from "../test-helpers/define-schema.js";
import { TEST_SCHEMA } from "../test-helpers/test-schema.js";
import { Base } from "../index.js";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";

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
  encryptFixtures: boolean;
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
    encryptFixtures: c.encryptFixtures,
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
  c.encryptFixtures = snapshot.encryptFixtures;
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
    encryptFixtures: boolean;
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
  // Mirrors Rails' encryption test helper which unconditionally prepends EncryptedFixtures:
  // `class ActiveRecord::Fixture; prepend ActiveRecord::Encryption::EncryptedFixtures; end`
  Configurable.config.encryptFixtures = overrides.encryptFixtures ?? true;
}

export const AUTHOR_NAME_LIMIT = 100;

// ─── Test adapter factory ─────────────────────────────────────────────────────

/**
 * The canonical tables the encryption fixtures ride, mirroring Rails exactly:
 *   - `EncryptedPost` → `posts` (post_encrypted.rb: `self.table_name = "posts"`)
 *   - every `EncryptedBook*` / `UnencryptedBook` variant → `encrypted_books`
 *     (book_encrypted.rb consolidates them all onto one table)
 *   - `EncryptedAuthor` → `authors` (author_encrypted.rb)
 *   - `EncryptedTrafficLightWithStoreState` → `traffic_lights`
 *     (traffic_light_encrypted.rb)
 *
 * All four already exist in the canonical `TEST_SCHEMA` with the Rails
 * schema.rb shape, so the fixtures name only canonical tables/columns. Under
 * one-schema mode the tables are already laid into the worker DB and this
 * `defineSchema` call is a canonical no-op; on the default path it lays the
 * full canonical shape once per lease.
 */
const ENCRYPTION_CANONICAL_TABLES = [
  "posts",
  "encrypted_books",
  "authors",
  "traffic_lights",
  // `to_be_linked_users` carries a canonical `settings` (text) column, the ride
  // for makeFreshModel's serialized-attribute callsite (no Rails counterpart).
  "to_be_linked_users",
] as const;

export async function installEncryptionSchema(adapter: DatabaseAdapter): Promise<void> {
  const schema: Schema = {};
  for (const table of ENCRYPTION_CANONICAL_TABLES) {
    schema[table] = TEST_SCHEMA[table as keyof typeof TEST_SCHEMA];
  }
  await defineSchema(adapter, schema);
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
 * Creates a fresh model class riding an existing canonical `tableName`, with the
 * given attributes declared explicitly (no DDL). Attribute types are passed as
 * strings (e.g. "integer", "string"); every declared column must already exist
 * on the canonical table. Use this when you need to apply a specific encryption
 * scheme to an attribute without the idempotency guard blocking a second
 * `encrypts()` call — a fresh class dodges the guard without needing a bespoke
 * (`fresh_model_N`) table, keeping the suite one-schema clean.
 */
export async function makeFreshModel(
  adapter: DatabaseAdapter,
  tableName: string,
  attributes: Record<string, string>,
): Promise<any> {
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
      this._tableName = "posts";
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
      this._tableName = "encrypted_books";
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
      this._tableName = "encrypted_books";
      this.attribute("id", "integer");
      this.attribute("name", "string", { default: "<untitled>" });
      this.adapter = adapter;
      this.encrypts("name", { deterministic: true, downcase: true });
    }
  } as any;
}

export function makeEncryptedBookThatIgnoresCase(adapter: DatabaseAdapter) {
  return class EncryptedBookThatIgnoresCase extends Base {
    static {
      this._tableName = "encrypted_books";
      this.attribute("id", "integer");
      this.attribute("name", "string", { default: "<untitled>" });
      this.attribute("original_name", "string");
      this.adapter = adapter;
      this.encrypts("name", { deterministic: true, ignoreCase: true });
    }
  } as any;
}

export function makeEncryptedAuthor(adapter: DatabaseAdapter) {
  return class EncryptedAuthor extends Base {
    static {
      this._tableName = "authors";
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
      this._tableName = "encrypted_books";
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
      this._tableName = "encrypted_books";
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
      this._tableName = "traffic_lights";
      this.attribute("id", "integer");
      this.attribute("state", "json");
      // Canonical `traffic_lights.long_state` is `text NOT NULL`; the parent
      // Rails TrafficLight serializes it as an Array (traffic_light.rb:4), so the
      // fixture mirrors that with the same serialize/Array coder the canonical
      // TrafficLight model uses (test-helpers/models/traffic-light.ts) and callers
      // supply a value (Rails passes `long_state: ["green", "red"]`). This fresh
      // factory declares its attributes explicitly rather than by schema
      // reflection, so the column is declared before serialize wraps it.
      this.attribute("long_state", "string");
      this.serialize("long_state", { type: "Array" });
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
      this._tableName = "encrypted_books";
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
      this._tableName = "encrypted_books";
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
      this._tableName = "encrypted_books";
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
      this._tableName = "encrypted_books";
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
      this.attribute("name", "string", { default: "<untitled>" });
      this.adapter = adapter;
      this.encrypts("name", { messageSerializer: new MessagePackMessageSerializer() });
    }
  } as any;
}

/**
 * UnencryptedBook: shares the encrypted_books table but declares no encryption.
 * Mirrors Rails' book_encrypted.rb / UnencryptedBook.
 */
export function makeUnencryptedBook(adapter: DatabaseAdapter) {
  return class UnencryptedBook extends Base {
    static {
      this._tableName = "encrypted_books";
      this.attribute("id", "integer");
      this.attribute("name", "string", { default: "<untitled>" });
      this.adapter = adapter;
    }
  } as any;
}

/**
 * EncryptedBookWithUniquenessValidation: name is encrypted deterministically
 * and validates uniqueness. Mirrors Rails' EncryptedBookWithUniquenessValidation.
 */
export function makeEncryptedBookWithUniquenessValidation(adapter: DatabaseAdapter) {
  return class EncryptedBookWithUniquenessValidation extends Base {
    static {
      this._tableName = "encrypted_books";
      this.attribute("id", "integer");
      this.attribute("name", "string", { default: "<untitled>" });
      this.adapter = adapter;
      this.validatesUniqueness("name");
      this.encrypts("name", { deterministic: true });
    }
  } as any;
}

/**
 * EncryptedBookAttribute: declares `name` as a `:date` attribute, then encrypts it.
 * Mirrors Rails' EncryptedBookAttribute (attribute :name, :date + encrypts :name).
 */
export function makeEncryptedBookAttribute(adapter: DatabaseAdapter) {
  return class EncryptedBookAttribute extends Base {
    static {
      this._tableName = "encrypted_books";
      this.attribute("id", "integer");
      this.attribute("name", "date");
      this.adapter = adapter;
      this.encrypts("name");
    }
  } as any;
}

// Mirrors Ruby's `value.to_s.downcase` on an ASCII-8BIT string: only ASCII
// A–Z bytes are lowercased; bytes > 0x7F are preserved bit-for-bit (Ruby's
// downcase on a binary string does not perform Unicode case folding).
// For our `logo: binary` attribute the cast type yields a Uint8Array,
// so we lowercase bytes directly and return a Uint8Array to preserve the
// binary cast type through normalization (which writes back via
// writeCastValue after casting).
function _downcaseLikeRails(v: unknown): unknown {
  if (v == null) return v;
  if (v instanceof Uint8Array) {
    const out = new Uint8Array(v.length);
    for (let i = 0; i < v.length; i++) {
      const b = v[i];
      out[i] = b >= 0x41 && b <= 0x5a ? b + 0x20 : b;
    }
    return out;
  }
  return String(v).toLowerCase();
}

/**
 * EncryptedBookNormalizedFirst: declares normalizes before encrypts on both
 * `name` and `logo`. Mirrors Rails' EncryptedBookNormalizedFirst — exercises
 * normalize-then-encrypt order.
 */
export function makeEncryptedBookNormalizedFirst(adapter: DatabaseAdapter) {
  return class EncryptedBookNormalizedFirst extends Base {
    static {
      this._tableName = "encrypted_books";
      this.attribute("id", "integer");
      this.attribute("name", "string", { default: "<untitled>" });
      this.attribute("logo", "binary");
      this.adapter = adapter;
      this.normalizes("name", _downcaseLikeRails);
      this.encrypts("name");
      this.normalizes("logo", _downcaseLikeRails);
      this.encrypts("logo");
    }
  } as any;
}

/**
 * EncryptedBookNormalizedSecond: declares encrypts before normalizes on both
 * `name` and `logo`. Mirrors Rails' EncryptedBookNormalizedSecond — exercises
 * encrypt-then-normalize order.
 */
export function makeEncryptedBookNormalizedSecond(adapter: DatabaseAdapter) {
  return class EncryptedBookNormalizedSecond extends Base {
    static {
      this._tableName = "encrypted_books";
      this.attribute("id", "integer");
      this.attribute("name", "string", { default: "<untitled>" });
      this.attribute("logo", "binary");
      this.adapter = adapter;
      this.encrypts("name");
      this.normalizes("name", _downcaseLikeRails);
      this.encrypts("logo");
      this.normalizes("logo", _downcaseLikeRails);
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
    readValue.every((b, i) => b === expectedValue[i])
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
      type && typeof type.castType?.serialize === "function"
        ? type.castType.serialize(expectedValue)
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
      dbBytes.every((b, i) => b === plaintextBytes[i]);

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
 * Mirrors Rails' assert_not_encrypted_attribute (helper.rb:36-39):
 *   assert_equal expected_value, model.send(attribute_name)
 *   assert_equal expected_value, model.read_attribute_before_type_cast(attribute_name)
 * The read value equals the expected plaintext AND the raw (before-type-cast)
 * stored value also equals it — i.e. the attribute was stored unencrypted.
 */
export function assertNotEncryptedAttribute(
  model: any,
  attrName: string,
  expectedValue: unknown,
): void {
  const readValue = model[attrName];
  if (!_valuesEqual(readValue, expectedValue)) {
    throw new Error(
      `assertNotEncryptedAttribute: expected ${attrName} to read as ` +
        `${JSON.stringify(expectedValue)}, got ${JSON.stringify(readValue)}`,
    );
  }
  const rawValue = model.readAttributeBeforeTypeCast(attrName);
  if (!_valuesEqual(rawValue, expectedValue)) {
    throw new Error(
      `assertNotEncryptedAttribute: expected before-type-cast ${attrName} to equal ` +
        `${JSON.stringify(expectedValue)} (stored as plaintext), got ${JSON.stringify(rawValue)}`,
    );
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
  const klass = model.constructor;
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
