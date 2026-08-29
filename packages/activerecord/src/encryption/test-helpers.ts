
import { expect } from "vitest";
import { Temporal } from "@blazetrails/date";
import type { TestDatabaseAdapter } from "../test-adapter.js";
import { ensureCanonicalTables } from "../support/canonical-table-rebuild.js";
import { Base } from "../index.js";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";

export { Base };
import { Configurable } from "./configurable.js";
import { type Compressor } from "./config.js";
import { Contexts } from "./contexts.js";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";
import { Encryptor as EncryptorImpl } from "./encryptor.js";
import type { KeyProviderLike } from "./encryptor.js";
import { type Scheme } from "./scheme.js";
import { Decryption, Encryption } from "./errors.js";
import { BinaryData } from "@blazetrails/activemodel";
import "../encryption.js";
import type { Encryptor } from "../encryption.js";
import { MessagePackMessageSerializer } from "./message-pack-message-serializer.js";

export { withEncryptionContext, withoutEncryption } from "../encryption.js";
export { Decryption, Encryption };


export { TEST_PRIMARY_KEY, TEST_DETERMINISTIC_KEY, TEST_KEY_DERIVATION_SALT } from "./test-keys.js";
import { TEST_PRIMARY_KEY, TEST_DETERMINISTIC_KEY, TEST_KEY_DERIVATION_SALT } from "./test-keys.js";


interface ConfigSnapshot {
  primaryKey: string | string[] | undefined;
  deterministicKey: string | undefined;
  keyDerivationSalt: string | undefined;
  supportUnencryptedData: boolean;
  encryptFixtures: boolean;
  previousSchemes: typeof Configurable.config.previousSchemes;
  forcedEncodingForDeterministicEncryption: string;
}

export function snapshotEncryptionConfig(): ConfigSnapshot {
  const c = Configurable.config;
  return {
    primaryKey: c.hasPrimaryKey(),
    deterministicKey: c.hasDeterministicKey(),
    keyDerivationSalt: c.hasKeyDerivationSalt(),
    supportUnencryptedData: c.supportUnencryptedData,
    encryptFixtures: c.encryptFixtures,
    previousSchemes: [...c.previousSchemes],
    forcedEncodingForDeterministicEncryption: c.forcedEncodingForDeterministicEncryption,
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
  Contexts.resetDefaultContext();
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
  Configurable.config.encryptFixtures = overrides.encryptFixtures ?? true;
  Configurable.config.previousSchemes.length = 0;
}

export const AUTHOR_NAME_LIMIT = 100;


const ENCRYPTION_CANONICAL_TABLES = [
  "posts",
  "encrypted_books",
  "authors",
  "traffic_lights",
] as const;

export async function installEncryptionSchema(adapter: DatabaseAdapter): Promise<void> {
  await ensureCanonicalTables(adapter, ENCRYPTION_CANONICAL_TABLES);
}

export async function freshAdapter(): Promise<TestDatabaseAdapter> {
  const adapter = await Base.leaseConnection();
  await installEncryptionSchema(adapter);
  return adapter;
}


export function makePlainPost(adapter: DatabaseAdapter) {
  return class PlainPost extends Base {
    static {
      this._tableName = "posts";
      this.attribute("id", "integer");
      this.attribute("title", "string");
      this.attribute("body", "string");
      this.adapter = adapter;
    }
  } as any;
}

export function makeEncryptedAuthorWithPreviousSchemes(
  adapter: DatabaseAdapter,
  previousSchemes: Scheme[],
) {
  return class EncryptedAuthor extends Base {
    static {
      this._tableName = "authors";
      this.attribute("id", "integer");
      this.attribute("name", "string");
      this.adapter = adapter;
      this.encrypts("name", { previousSchemes });
    }
  } as any;
}

export function makeEncryptedPost(adapter: DatabaseAdapter) {
  return class EncryptedPost extends Base {
    static {
      this._tableName = "posts";
      this.attribute("id", "integer");
      this.attribute("title", "string");
      this.attribute("body", "text");
      this.adapter = adapter;
      this.encrypts("title");
      this.encrypts("body");
    }
  } as any;
}

export function makeEncryptedBook(adapter: DatabaseAdapter) {
  return class EncryptedBook extends Base {
    static {
      this._tableName = "encrypted_books";
      this.attribute("created_at", "datetime");
      this.attribute("updated_at", "datetime");
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
      this.attribute("created_at", "datetime");
      this.attribute("updated_at", "datetime");
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
      this.attribute("created_at", "datetime");
      this.attribute("updated_at", "datetime");
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
  const customCompressor: Compressor = {
    deflate(data: string): Buffer | Uint8Array {
      return Configurable.config.compressor.deflate(data);
    },
    inflate(data: Buffer | Uint8Array): string {
      return "[compressed] " + Configurable.config.compressor.inflate(data);
    },
  };
  return class EncryptedBookWithCustomCompressor extends Base {
    static {
      this._tableName = "encrypted_books";
      this.attribute("created_at", "datetime");
      this.attribute("updated_at", "datetime");
      this.attribute("id", "integer");
      this.attribute("name", "string");
      this.adapter = adapter;
      this.encrypts("name", { compressor: customCompressor });
    }
  } as any;
}

const _failingEncryptor: Encryptor = {
  encrypt(_value: string): string {
    throw new Encryption("deliberate encryption failure");
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
      this.attribute("created_at", "datetime");
      this.attribute("updated_at", "datetime");
      this.attribute("id", "integer");
      this.attribute("name", "string");
      this.adapter = adapter;
      this.encrypts("name", { encryptor: _failingEncryptor });
    }
  } as any;
}

export function makeEncryptedTrafficLight(adapter: DatabaseAdapter) {
  return class EncryptedTrafficLight extends Base {
    static {
      this._tableName = "traffic_lights";
      this.attribute("id", "integer");
      this.attribute("state", "string");
      this.attribute("long_state", "string");
      this.attribute("created_at", "datetime");
      this.attribute("updated_at", "datetime");
      this.serialize("state", { type: Array });
      this.serialize("long_state", { type: Array });
      this.adapter = adapter;
      this.encrypts("state");
    }
  } as any;
}

export function makeEncryptedTrafficLightWithStoreState(adapter: DatabaseAdapter) {
  return class EncryptedTrafficLightWithStoreState extends Base {
    static {
      this._tableName = "traffic_lights";
      this.attribute("id", "integer");
      this.attribute("state", "json");
      this.attribute("created_at", "datetime");
      this.attribute("updated_at", "datetime");
      this.attribute("long_state", "string");
      this.serialize("long_state", { type: Array });
      this.adapter = adapter;
      this.encrypts("state");
      this.storeAccessor("state", "color");
    }
  } as any;
}

export function makeEncryptedBookWithBinaryMessagePackSerialized(adapter: DatabaseAdapter) {
  return class EncryptedBookWithBinaryMessagePackSerialized extends Base {
    static {
      this._tableName = "encrypted_books";
      this.adapter = adapter;
      this.encrypts("logo", { messageSerializer: new MessagePackMessageSerializer() });
    }
  } as any;
}

export function makeMsgPackTextBook(adapter: DatabaseAdapter) {
  return class MsgPackTextBook extends Base {
    static {
      this._tableName = "encrypted_books";
      this.attribute("created_at", "datetime");
      this.attribute("updated_at", "datetime");
      this.attribute("id", "integer");
      this.attribute("name", "string", { default: "<untitled>" });
      this.adapter = adapter;
      this.encrypts("name", { messageSerializer: new MessagePackMessageSerializer() });
    }
  } as any;
}

export function makeUnencryptedBook(adapter: DatabaseAdapter) {
  return class UnencryptedBook extends Base {
    static {
      this._tableName = "encrypted_books";
      this.attribute("created_at", "datetime");
      this.attribute("updated_at", "datetime");
      this.attribute("id", "integer");
      this.attribute("name", "string", { default: "<untitled>" });
      this.adapter = adapter;
    }
  } as any;
}

export function makeEncryptedBookWithUniquenessValidation(adapter: DatabaseAdapter) {
  return class EncryptedBookWithUniquenessValidation extends Base {
    static {
      this._tableName = "encrypted_books";
      this.attribute("created_at", "datetime");
      this.attribute("updated_at", "datetime");
      this.attribute("id", "integer");
      this.attribute("name", "string", { default: "<untitled>" });
      this.adapter = adapter;
      this.validatesUniquenessOf("name");
      this.encrypts("name", { deterministic: true });
    }
  } as any;
}

export function makeEncryptedBookAttribute(adapter: DatabaseAdapter) {
  return class EncryptedBookAttribute extends Base {
    static {
      this._tableName = "encrypted_books";
      this.attribute("created_at", "datetime");
      this.attribute("updated_at", "datetime");
      this.attribute("id", "integer");
      this.attribute("name", "date");
      this.adapter = adapter;
      this.encrypts("name");
    }
  } as any;
}


/** @internal */
function _isBinaryAttribute(model: any, attrName: string): boolean {
  let type = model._attributes?.getAttribute?.(attrName)?.type;
  const seen = new Set<unknown>();
  while (type != null && !seen.has(type)) {
    if (type.isBinary?.() === true) return true;
    seen.add(type);
    type = type.castType ?? type.subtype;
  }
  return false;
}

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

function _valuesEqual(
  readValue: unknown,
  expectedValue: unknown,
  isBinaryAttribute = false,
): boolean {
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
  if (isBinaryAttribute && readValue instanceof Uint8Array && typeof expectedValue === "string")
    return Buffer.from(readValue).toString("latin1") === expectedValue;
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
  if (!_valuesEqual(readValue, expectedValue, _isBinaryAttribute(model, attrName))) {
    throw new Error(
      `assertEncryptedAttribute: expected ${attrName} to equal ` +
        `${JSON.stringify(expectedValue)}, got ${JSON.stringify(readValue)}`,
    );
  }

  if (expectedValue !== null && expectedValue !== undefined) {
    const dbValues = model._attributes.valuesForDatabase();
    const dbValue = dbValues[attrName];
    const type = model._attributes?.getAttribute?.(attrName)?.type;
    const rawSerialized =
      type && typeof type.castType?.serialize === "function"
        ? type.castType.serialize(expectedValue)
        : null;
    const serializedPlaintext = rawSerialized != null ? String(rawSerialized) : null;

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

export function assertNotEncryptedAttribute(
  model: any,
  attrName: string,
  expectedValue: unknown,
): void {
  const readValue = model[attrName];
  if (!_valuesEqual(readValue, expectedValue, _isBinaryAttribute(model, attrName))) {
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

export function ciphertextFor(model: any, attrName: string): unknown {
  const klass = model.constructor;
  const type = klass.typeForAttribute?.(attrName);
  if (type && typeof type.serialize === "function" && typeof type.isEncrypted === "function") {
    const value = model[attrName];
    return type.serialize(value);
  }
  return model.readAttributeBeforeTypeCast(attrName);
}

export function assertEncryptorWorksWith(keyProvider: KeyProviderLike): void {
  const encryptor = new EncryptorImpl();

  const encryptedMessage = encryptor.encrypt("some text", { keyProvider });
  expect(encryptor.decrypt(encryptedMessage, { keyProvider })).toEqual("some text");
}

export function makeKeyProvider(password: string) {
  return new DerivedSecretKeyProvider(password);
}
