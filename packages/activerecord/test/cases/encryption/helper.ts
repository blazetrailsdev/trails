import { expect } from "vitest";
import { Table, UpdateManager } from "@blazetrails/arel";
import type { TestDatabaseAdapter } from "../../support/test-adapter.js";
import { ensureCanonicalTables } from "../../support/canonical-table-rebuild.js";
import { Base } from "../../../lib/index.js";
import type { AbstractAdapter as DatabaseAdapter } from "../../../lib/connection-adapters/abstract-adapter.js";

export { Base };
import { type Compressor } from "../../../lib/encryption/config.js";
import { DerivedSecretKeyProvider } from "../../../lib/encryption/derived-secret-key-provider.js";
import { Encryptor as EncryptorImpl } from "../../../lib/encryption/encryptor.js";
import type { KeyProviderLike } from "../../../lib/encryption/encryptor.js";
import { type Scheme } from "../../../lib/encryption/scheme.js";
import * as Errors from "../../../lib/encryption/errors.js";
import { assertEqual, assertNotEqual } from "@blazetrails/activesupport/testing/assertions";
import { Encryption } from "../../../lib/encryption.js";
import { MessagePackMessageSerializer } from "../../../lib/encryption/message-pack-message-serializer.js";

import { Key } from "../../../lib/encryption/key.js";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import { prepend } from "@blazetrails/ruby-compat/include";
import { Fixture } from "../../../lib/fixtures.js";
import { EncryptedFixtures } from "../../../lib/encryption/encrypted-fixtures.js";
export { Encryption, Errors };

prepend(Fixture, EncryptedFixtures);

import { TEST_PRIMARY_KEY, TEST_DETERMINISTIC_KEY, TEST_KEY_DERIVATION_SALT } from "../helper.js";

interface ConfigSnapshot {
  primaryKey: string | string[] | null | undefined;
  deterministicKey: string | null | undefined;
  keyDerivationSalt: string | null | undefined;
  supportUnencryptedData: boolean;
  encryptFixtures: boolean;
  previousSchemes: typeof Encryption.config.previousSchemes;
  forcedEncodingForDeterministicEncryption: string;
}

export function snapshotEncryptionConfig(): ConfigSnapshot {
  const c = Encryption.config;
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
  const c = Encryption.config;
  c.primaryKey = snapshot.primaryKey;
  c.deterministicKey = snapshot.deterministicKey;
  c.keyDerivationSalt = snapshot.keyDerivationSalt;
  c.supportUnencryptedData = snapshot.supportUnencryptedData;
  c.encryptFixtures = snapshot.encryptFixtures;
  c.previousSchemes = snapshot.previousSchemes;
  c.forcedEncodingForDeterministicEncryption = snapshot.forcedEncodingForDeterministicEncryption;
  Encryption.resetDefaultContext();
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
  Encryption.configure({
    primaryKey: overrides.primaryKey ?? TEST_PRIMARY_KEY,
    deterministicKey: overrides.deterministicKey ?? TEST_DETERMINISTIC_KEY,
    keyDerivationSalt: overrides.keyDerivationSalt ?? TEST_KEY_DERIVATION_SALT,
  });
  if (overrides.supportUnencryptedData !== undefined) {
    Encryption.config.supportUnencryptedData = overrides.supportUnencryptedData;
  }
  Encryption.config.encryptFixtures = overrides.encryptFixtures ?? true;
  Encryption.config.previousSchemes.length = 0;
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

export declare class PlainPostRecord extends Base {
  title: string | null;
  body: string | null;
}

export declare class EncryptedAuthorRecord extends Base {
  name: string | null;
  static findByName: (name: string) => Promise<EncryptedAuthorRecord | null>;
}

export declare class EncryptedPostRecord extends Base {
  title: string | null;
  body: string | null;
}

export declare class EncryptedBookRecord extends Base {
  name: string | null;
  static findByName: (name: string) => Promise<EncryptedBookRecord | null>;
}

export declare class EncryptedBookWithDowncaseNameRecord extends Base {
  name: string | null;
  static findByName: (name: string) => Promise<EncryptedBookWithDowncaseNameRecord | null>;
}

export declare class EncryptedBookThatIgnoresCaseRecord extends Base {
  get name(): string | null;
  set name(value: unknown);
  static findByName: (name: string) => Promise<EncryptedBookThatIgnoresCaseRecord | null>;
}

export declare class EncryptedBookWithCustomCompressorRecord extends Base {
  name: string | null;
  static findByName: (name: string) => Promise<EncryptedBookWithCustomCompressorRecord | null>;
}

export declare class BookThatWillFailToEncryptNameRecord extends Base {
  name: string | null;
  static findByName: (name: string) => Promise<BookThatWillFailToEncryptNameRecord | null>;
}

export declare class EncryptedTrafficLightRecord extends Base {}

export declare class EncryptedTrafficLightWithStoreStateRecord extends Base {
  color: string | null;
  long_state: string[] | null;
}

export declare class EncryptedBookWithBinaryMessagePackSerializedRecord extends Base {}

export declare class MsgPackTextBookRecord extends Base {
  name: string | null;
  static findByName: (name: string) => Promise<MsgPackTextBookRecord | null>;
}

export declare class UnencryptedBookRecord extends Base {
  name: string | null;
  static findByName: (name: string) => Promise<UnencryptedBookRecord | null>;
}

export declare class EncryptedBookWithUniquenessValidationRecord extends Base {
  name: string | null;
  static findByName: (name: string) => Promise<EncryptedBookWithUniquenessValidationRecord | null>;
}

export declare class EncryptedBookAttributeRecord extends Base {
  name: Date | null;
  static findByName: (name: string) => Promise<EncryptedBookAttributeRecord | null>;
}

export function makePlainPost() {
  return class PlainPost extends Base {
    static {
      this._tableName = "posts";
      this.attribute("id", "integer");
      this.attribute("title", "string");
      this.attribute("body", "string");
    }
  } as unknown as typeof PlainPostRecord;
}

export function makeEncryptedAuthorWithPreviousSchemes(previousSchemes: Scheme[]) {
  return class EncryptedAuthor extends Base {
    static {
      this._tableName = "authors";
      this.attribute("id", "integer");
      this.attribute("name", "string");
      this.encrypts("name", { previousSchemes });
    }
  } as unknown as typeof EncryptedAuthorRecord;
}

class MutableDerivedSecretKeyProvider extends DerivedSecretKeyProvider {
  get keys(): Key[] {
    return this._keys;
  }

  set keys(keys: Key[]) {
    this._keys = keys;
  }
}

export function makeEncryptedPost() {
  return class EncryptedPost extends Base {
    static {
      this._tableName = "posts";
      this.attribute("id", "integer");
      this.attribute("title", "string");
      this.attribute("body", "text");
      this.encrypts("title");
      this.encrypts("body", {
        keyProvider: new MutableDerivedSecretKeyProvider("my post body secret!"),
      });
    }
  } as unknown as typeof EncryptedPostRecord;
}

export function makeEncryptedBook() {
  return class EncryptedBook extends Base {
    static {
      this._tableName = "encrypted_books";
      this.attribute("created_at", "datetime");
      this.attribute("updated_at", "datetime");
      this.attribute("id", "integer");
      this.attribute("name", "string", { default: "<untitled>" });
      this.encrypts("name", { deterministic: true });
    }
  } as unknown as typeof EncryptedBookRecord;
}

export function makeEncryptedBookWithDowncaseName() {
  return class EncryptedBookWithDowncaseName extends Base {
    static {
      this._tableName = "encrypted_books";
      this.attribute("created_at", "datetime");
      this.attribute("updated_at", "datetime");
      this.attribute("id", "integer");
      this.attribute("name", "string", { default: "<untitled>" });
      this.encrypts("name", { deterministic: true, downcase: true });
    }
  } as unknown as typeof EncryptedBookWithDowncaseNameRecord;
}

export function makeEncryptedBookThatIgnoresCase() {
  return class EncryptedBookThatIgnoresCase extends Base {
    static {
      this._tableName = "encrypted_books";
      this.attribute("created_at", "datetime");
      this.attribute("updated_at", "datetime");
      this.attribute("id", "integer");
      this.attribute("name", "string", { default: "<untitled>" });
      this.attribute("original_name", "string");
      this.encrypts("name", { deterministic: true, ignoreCase: true });
    }
  } as unknown as typeof EncryptedBookThatIgnoresCaseRecord;
}

export async function createUnencryptedBookIgnoringCase<T extends typeof Base>(
  encryptedBookThatIgnoresCase: T,
  { name }: { name: string },
): Promise<InstanceType<T>> {
  const book = await Encryption.withoutEncryption(() =>
    encryptedBookThatIgnoresCase.createBang({ name }),
  );

  const encryptedBooks = new Table("encrypted_books");
  const um = new UpdateManager(encryptedBooks);
  um.set([[encryptedBooks.get("name"), name]]);
  um.where(encryptedBooks.get("id").eq(book.id));
  await (await encryptedBookThatIgnoresCase.leaseConnection()).update(um);

  await book.reload();
  return book;
}

export function makeEncryptedAuthor() {
  return class EncryptedAuthor extends Base {
    static {
      this._tableName = "authors";
      this.attribute("id", "integer");
      this.attribute("name", "string", { limit: AUTHOR_NAME_LIMIT });
      this.encrypts("name");
    }
  } as unknown as typeof EncryptedAuthorRecord;
}

export function makeEncryptedBookWithCustomCompressor() {
  const customCompressor: Compressor = {
    deflate(data: string): Buffer | Uint8Array {
      return Encryption.config.compressor.deflate(data);
    },
    inflate(data: Buffer | Uint8Array): Buffer {
      return Buffer.from("[compressed] " + Encryption.config.compressor.inflate(data));
    },
  };
  return class EncryptedBookWithCustomCompressor extends Base {
    static {
      this._tableName = "encrypted_books";
      this.attribute("created_at", "datetime");
      this.attribute("updated_at", "datetime");
      this.attribute("id", "integer");
      this.attribute("name", "string");
      this.encrypts("name", { compressor: customCompressor });
    }
  } as unknown as typeof EncryptedBookWithCustomCompressorRecord;
}

class FailingKeyProvider {
  decryptionKey(_message: unknown): void {}

  encryptionKey(): never {
    throw new Errors.Encryption();
  }
}

export function makeBookThatWillFailToEncryptName() {
  return class BookThatWillFailToEncryptName extends Base {
    static {
      this._tableName = "encrypted_books";
      this.attribute("created_at", "datetime");
      this.attribute("updated_at", "datetime");
      this.attribute("id", "integer");
      this.attribute("name", "string");
      this.encrypts("name", { keyProvider: new FailingKeyProvider() });
    }
  } as unknown as typeof BookThatWillFailToEncryptNameRecord;
}

export function makeEncryptedTrafficLight() {
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
      this.encrypts("state");
    }
  } as unknown as typeof EncryptedTrafficLightRecord;
}

export function makeEncryptedTrafficLightWithStoreState() {
  return class EncryptedTrafficLightWithStoreState extends Base {
    static {
      this._tableName = "traffic_lights";
      this.attribute("id", "integer");
      this.attribute("state", "json");
      this.attribute("created_at", "datetime");
      this.attribute("updated_at", "datetime");
      this.attribute("long_state", "string");
      this.serialize("long_state", { type: Array });
      this.encrypts("state");
      this.storeAccessor("state", "color");
    }
  } as unknown as typeof EncryptedTrafficLightWithStoreStateRecord;
}

export function makeEncryptedBookWithBinaryMessagePackSerialized() {
  return class EncryptedBookWithBinaryMessagePackSerialized extends Base {
    static {
      this._tableName = "encrypted_books";
      this.encrypts("logo", { messageSerializer: new MessagePackMessageSerializer() });
    }
  } as unknown as typeof EncryptedBookWithBinaryMessagePackSerializedRecord;
}

export function makeMsgPackTextBook() {
  return class MsgPackTextBook extends Base {
    static {
      this._tableName = "encrypted_books";
      this.attribute("created_at", "datetime");
      this.attribute("updated_at", "datetime");
      this.attribute("id", "integer");
      this.attribute("name", "string", { default: "<untitled>" });
      this.encrypts("name", { messageSerializer: new MessagePackMessageSerializer() });
    }
  } as unknown as typeof MsgPackTextBookRecord;
}

export function makeUnencryptedBook() {
  return class UnencryptedBook extends Base {
    static {
      this._tableName = "encrypted_books";
      this.attribute("created_at", "datetime");
      this.attribute("updated_at", "datetime");
      this.attribute("id", "integer");
      this.attribute("name", "string", { default: "<untitled>" });
    }
  } as unknown as typeof UnencryptedBookRecord;
}

export function makeEncryptedBookWithUniquenessValidation() {
  return class EncryptedBookWithUniquenessValidation extends Base {
    static {
      this._tableName = "encrypted_books";
      this.attribute("created_at", "datetime");
      this.attribute("updated_at", "datetime");
      this.attribute("id", "integer");
      this.attribute("name", "string", { default: "<untitled>" });
      this.validatesUniquenessOf("name");
      this.encrypts("name", { deterministic: true });
    }
  } as unknown as typeof EncryptedBookWithUniquenessValidationRecord;
}

export function makeEncryptedBookAttribute() {
  return class EncryptedBookAttribute extends Base {
    static {
      this._tableName = "encrypted_books";
      this.attribute("created_at", "datetime");
      this.attribute("updated_at", "datetime");
      this.attribute("id", "integer");
      this.attribute("name", "date");
      this.encrypts("name");
    }
  } as unknown as typeof EncryptedBookAttributeRecord;
}

function attributeOf(model: Base, name: string): unknown {
  return (model as unknown as Record<string, unknown>)[name];
}

function typeOf(model: Base, name: string): EncryptedAttributeTypeLike {
  return model.constructor.typeForAttribute(name) as unknown as EncryptedAttributeTypeLike;
}

interface EncryptedAttributeTypeLike {
  deserialize(value: unknown): unknown;
  serialize(value: unknown): unknown;
  isEncrypted?: unknown;
  keyProvider: { keys: Key[] };
}

export function assertCiphertextDecryptsTo(
  model: Base,
  attributeName: string,
  ciphertext: unknown,
): void {
  assertNotEqual(attributeOf(model, attributeName), ciphertext);
  assertNotEqual(model.readAttribute(attributeName), ciphertext);
  const cleartext = typeOf(model, attributeName).deserialize(ciphertext);
  assertEqual(model.readAttribute(attributeName), cleartext);
}

export async function assertEncryptedAttribute(
  model: Base,
  attributeName: string,
  expectedValue: unknown,
): Promise<void> {
  assertCiphertextDecryptsTo(
    model,
    attributeName,
    model.readAttributeBeforeTypeCast(attributeName),
  );
  assertEqual(expectedValue, attributeOf(model, attributeName));
  if (!model.isNewRecord()) {
    await model.reload();
    assertCiphertextDecryptsTo(
      model,
      attributeName,
      model.readAttributeBeforeTypeCast(attributeName),
    );
    assertEqual(expectedValue, attributeOf(model, attributeName));
  }
}

export async function assertInvalidKeyCantReadAttribute(
  model: Base,
  attributeName: string,
): Promise<void> {
  if (rbObjRespondTo(typeOf(model, attributeName).keyProvider, "keys")) {
    await assertInvalidKeyCantReadAttributeWithCustomKeyProvider(model, attributeName);
  } else {
    await assertInvalidKeyCantReadAttributeWithDefaultKeyProvider(model, attributeName);
  }
}

async function assertInvalidKeyCantReadAttributeWithDefaultKeyProvider(
  model: Base,
  attributeName: string,
): Promise<void> {
  await model.reload();

  await Encryption.withEncryptionContext(
    { keyProvider: new DerivedSecretKeyProvider("a different 256 bits key for now") },
    () => {
      expect(() => attributeOf(model, attributeName)).toThrow(Errors.Decryption);
    },
  );
}

async function assertInvalidKeyCantReadAttributeWithCustomKeyProvider(
  model: Base,
  attributeName: string,
): Promise<void> {
  const attributeType = typeOf(model, attributeName);

  await model.reload();

  const originalKeys = attributeType.keyProvider.keys;
  try {
    attributeType.keyProvider.keys = [Key.deriveFrom("other custom attribute secret")];

    expect(() => attributeOf(model, attributeName)).toThrow(Errors.Decryption);
  } finally {
    attributeType.keyProvider.keys = originalKeys;
  }
}

export function assertNotEncryptedAttribute(
  model: Base,
  attributeName: string,
  expectedValue: unknown,
): void {
  assertEqual(expectedValue, attributeOf(model, attributeName));
  assertEqual(expectedValue, model.readAttributeBeforeTypeCast(attributeName));
}

export function ciphertextFor(model: Base, attrName: string): unknown {
  const type = typeOf(model, attrName);
  if (type && typeof type.serialize === "function" && typeof type.isEncrypted === "function") {
    const value = attributeOf(model, attrName);
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
