import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  freshAdapter,
  configureEncryption,
  snapshotEncryptionConfig,
  restoreEncryptionConfig,
  makeEncryptedPost,
  assertEncryptedAttribute,
} from "./test-helpers.js";
import { Encryption } from "../encryption.js";
import { fixtures } from "../test-fixtures.js";
import {
  EncryptedBookWithSerializedFirstBinary,
  EncryptedBookWithSerializedSecondBinary,
  EncryptedBookWithSerializedDeterministicName,
  EncryptedBook,
  UnencryptedBook,
} from "../test-helpers/models/book-encrypted.js";
import {
  _createRecord,
  cantModifyEncryptedAttributesWhenFrozen,
  decryptAttributes,
  deterministicEncryptedAttributes,
  encryptAttributes,
  encrypts,
  validateEncryptionAllowed,
} from "./encryptable-record.js";
import { generatedAttributeMethods } from "../attribute-methods.js";
import { AttributeRegistration, Model as ActiveModel } from "@blazetrails/activemodel";
import { include } from "@blazetrails/activesupport";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { Serialized } from "../type/serialized.js";
import { Base } from "../base.js";
import { LengthValidator } from "@blazetrails/activemodel";
import type { Hash } from "@blazetrails/ruby-compat";
import { BinaryType } from "@blazetrails/activemodel";

describe("ActiveRecord::Encryption::EncryptableRecordTest (trails)", () => {
  fixtures({});

  let configSnapshot: ReturnType<typeof snapshotEncryptionConfig>;

  beforeEach(() => {
    configSnapshot = snapshotEncryptionConfig();
    Encryption.config.previousSchemes = [];
    configureEncryption();
  });

  afterEach(() => {
    restoreEncryptionConfig(configSnapshot);
  });

  it("adds the encrypted column's length validation at schema load", async () => {
    await freshAdapter();
    Encryption.config.validateColumnSize = true;

    class EncryptedBookValidatingColumnSize extends Base {
      static _tableName = "encrypted_books";
      static {
        this.encrypts("name", { deterministic: true });
      }
    }

    const validatorsFor = (name: string): unknown[] =>
      (
        EncryptedBookValidatingColumnSize as unknown as { _validators: Hash<string, unknown[]> }
      )._validators.get(name)!;

    expect(validatorsFor("name").some((v) => v instanceof LengthValidator)).toBe(false);

    await EncryptedBookValidatingColumnSize.loadSchema();

    expect(
      validatorsFor("name").some(
        (v) =>
          v instanceof LengthValidator &&
          (v as { options?: { maximum?: number } }).options?.maximum === 1024,
      ),
    ).toBe(true);
  });

  it("resolves logo to Encrypted(Serialized(binary)) — serialize before encrypts", async () => {
    await freshAdapter();

    const encrypted = EncryptedBookWithSerializedFirstBinary.typeForAttribute("logo");
    expect(encrypted).toBeInstanceOf(EncryptedAttributeType);

    const serialized = (encrypted as EncryptedAttributeType).castType;
    expect(serialized).toBeInstanceOf(Serialized);

    const subtype = (serialized as Serialized).subtype;
    expect(subtype).toBeInstanceOf(BinaryType);
    expect(subtype).not.toBeInstanceOf(EncryptedAttributeType);
  });

  it("resolves logo to Serialized(Encrypted(binary)) — encrypts before serialize", async () => {
    await freshAdapter();

    const serialized = EncryptedBookWithSerializedSecondBinary.typeForAttribute("logo");
    expect(serialized).toBeInstanceOf(Serialized);

    const encrypted = (serialized as Serialized).subtype;
    expect(encrypted).toBeInstanceOf(EncryptedAttributeType);

    const subtype = (encrypted as EncryptedAttributeType).castType;
    expect(subtype).toBeInstanceOf(BinaryType);
    expect(subtype).not.toBeInstanceOf(Serialized);
  });

  it("does not grow the pending-decorator queue or reorder the nesting on _defaultAttributes rebuilds", async () => {
    await freshAdapter();

    const model = EncryptedBookWithSerializedSecondBinary as unknown as {
      typeForAttribute(name: string): unknown;
      _pendingAttributeModifications?: unknown[];
      _cachedDefaultAttributes?: unknown;
    };
    model.typeForAttribute("logo");
    const queueLength = model._pendingAttributeModifications?.length;
    expect(queueLength).toBeGreaterThan(0);

    for (let i = 0; i < 3; i++) {
      model._cachedDefaultAttributes = null;
      const type = model.typeForAttribute("logo");
      expect(type).toBeInstanceOf(Serialized);
      expect((type as Serialized).subtype).toBeInstanceOf(EncryptedAttributeType);
    }
    expect(model._pendingAttributeModifications?.length).toBe(queueLength);
  });

  it("includes a Serialized(Encrypted) attribute in deterministicEncryptedAttributes", async () => {
    await freshAdapter();

    const deterministic = deterministicEncryptedAttributes.call(
      EncryptedBookWithSerializedDeterministicName,
    );
    expect(deterministic!.includes("name")).toBe(true);
    expect(
      deterministicEncryptedAttributes
        .call(EncryptedBookWithSerializedSecondBinary)!
        .includes("logo"),
    ).toBe(false);
  });

  it("detects ciphertext through the Serialized(Encrypted) wrapper on encryptedAttribute?", async () => {
    await freshAdapter();

    const book = await EncryptedBookWithSerializedDeterministicName.create({ name: "Dune" });

    const reloaded = await EncryptedBookWithSerializedDeterministicName.find(book.id);
    expect(reloaded.name).toBe("Dune");
    expect(reloaded.isEncryptedAttribute("name")).toBe(true);
  });

  it("isEncryptedAttribute identifies encrypted vs plain attributes", async () => {
    await freshAdapter();
    const Post = makeEncryptedPost();
    new Post();
    expect(Post.encryptedAttributes?.has("title") ?? false).toBe(true);
    expect(Post.encryptedAttributes?.has("body") ?? false).toBe(true);
    expect(Post.encryptedAttributes?.has("id") ?? false).toBe(false);
  });

  it("threads the reflected column default so a plaintext default deserializes without decrypting", async () => {
    const adapter = await freshAdapter();
    const Book = class ReflectionOnlyEncryptedBook extends Base {
      declare name: string;
      static {
        this._tableName = "encrypted_books";
        this.attribute("created_at", "datetime");
        this.attribute("updated_at", "datetime");
        this.encrypts("name", { deterministic: true });
      }
    };
    await Book.loadSchema();

    Encryption.config.supportUnencryptedData = false;

    const book = await Encryption.withoutEncryption(() => Book.create({}));
    expect(book.name).toBe("<untitled>");

    const reloaded = await Book.find(book.id);
    expect(reloaded.name).toBe("<untitled>");
  });

  it("threads the true column default, not an attribute() override, into the encrypted type", async () => {
    const adapter = await freshAdapter();
    const Book = class OverriddenDefaultEncryptedBook extends Base {
      declare name: string;
      static {
        this._tableName = "encrypted_books";
        this.attribute("created_at", "datetime");
        this.attribute("updated_at", "datetime");
        this.attribute("name", "string", { default: "OVERRIDE" });
        this.encrypts("name", { deterministic: true });
      }
    };
    await Book.loadSchema();

    const type = Book.typeForAttribute("name") as unknown as { _default: unknown };
    expect(type._default).toBe("<untitled>");

    Encryption.config.supportUnencryptedData = false;

    const book = await Encryption.withoutEncryption(() => Book.create({ name: "<untitled>" }));
    const reloaded = await Book.find(book.id);
    expect(reloaded.name).toBe("<untitled>");
  });

  it("when ignore_case: true is declared before the attributes, the original_<name> reader still decrypts (replay-safe)", async () => {
    const adapter = await freshAdapter();
    const Book = class extends Base {
      static {
        this._tableName = "encrypted_books";
        this.encrypts("name", { deterministic: true, ignoreCase: true });
      }
    } as unknown as typeof Base & {
      create: (a: object) => Promise<Base>;
      find: (id: unknown) => Promise<Base>;
    };

    const book = await Book.create({ name: "Dune" });
    await assertEncryptedAttribute(book, "original_name", "Dune");

    const reloaded = await Book.find(book.id);
    expect((reloaded as unknown as { name: string }).name).toBe("Dune");
  });

  it("EncryptableRecord.validateEncryptionAllowed throws when encryption is frozen", () => {
    Encryption.withEncryptionContext({ frozenEncryption: true }, () => {
      expect(() => validateEncryptionAllowed.call({})).toThrow(
        "can't be modified because it is encrypted",
      );
    });
  });

  it("EncryptableRecord.validateEncryptionAllowed does not throw when encryption is not frozen", () => {
    expect(() => validateEncryptionAllowed.call({})).not.toThrow();
  });

  it("EncryptableRecord.cantModifyEncryptedAttributesWhenFrozen adds errors for changed encrypted attrs", async () => {
    await freshAdapter();
    const Post = makeEncryptedPost();
    new Post();
    const post = new Post({ title: "hello" });
    post.title = "changed";
    const errored: Array<[string, string]> = [];
    const proxy = Object.assign(Object.create(Object.getPrototypeOf(post)), post, {
      _errors: { add: (attr: string, msg: string) => errored.push([attr, msg]) },
    });
    cantModifyEncryptedAttributesWhenFrozen.call(proxy);
    expect(errored).toEqual([["title", "can't be modified because it is encrypted"]]);
  });

  it("EncryptableRecord.cantModifyEncryptedAttributesWhenFrozen adds no errors for unchanged attrs", async () => {
    await freshAdapter();
    const Post = makeEncryptedPost();
    new Post();
    const post = new Post({});
    const errored: Array<[string, string]> = [];
    const proxy = Object.assign(Object.create(Object.getPrototypeOf(post)), post, {
      _errors: { add: (attr: string, msg: string) => errored.push([attr, msg]) },
    });
    cantModifyEncryptedAttributesWhenFrozen.call(proxy);
    expect(errored).toEqual([]);
  });

  it("EncryptableRecord.encryptAttributes writes ciphertext to DB and keeps plaintext in memory", async () => {
    const adp = await freshAdapter();
    const Post = makeEncryptedPost();
    new Post();
    const post = await Post.create({ title: "Hello", body: "World" });
    await assertEncryptedAttribute(post, "title", "Hello");
    await encryptAttributes.call(post);
    expect(post.title).toBe("Hello");
    await assertEncryptedAttribute(await Post.find(post.id), "title", "Hello");
  });

  it("EncryptableRecord.decryptAttributes stores plaintext in DB", async () => {
    Encryption.config.supportUnencryptedData = true;
    const adp = await freshAdapter();
    const Post = makeEncryptedPost();
    new Post();
    const post = await Post.create({ title: "Hello", body: "World" });
    await assertEncryptedAttribute(post, "title", "Hello");
    await decryptAttributes.call(post);
    const reloaded = await Post.find(post.id);
    expect(reloaded.title).toBe("Hello");
  });
});

describe("ActiveRecord::Encryption::EncryptableRecord#_create_record (trails)", () => {
  it("adds every encrypted attribute to the names handed to super", async () => {
    const book = new EncryptedBook();
    const names = await _createRecord.call(book, ["format"], async (n: string[]) => n);
    expect(names).toEqual(["format", ...[...EncryptedBook.encryptedAttributes!].map(String)]);
  });

  it("leaves the names alone for a model without encrypted attributes", async () => {
    const book = new UnencryptedBook();
    const names = await _createRecord.call(book, ["format"], async (n: string[]) => n);
    expect(names).toEqual(["format"]);
  });
});

describe("ActiveRecord::Encryption::EncryptableRecord.encrypted_attributes? (trails)", () => {
  it("is true once a model has declared an encrypted attribute", () => {
    expect(EncryptedBook.isEncryptedAttributes).toBe(true);
  });

  it("is false for a model that never assigned the class_attribute", () => {
    expect(UnencryptedBook.isEncryptedAttributes).toBe(false);
  });
});

describe("EncryptableRecord.encryptAttribute — scheme-based ignore_case wiring", () => {
  let configSnapshot: ReturnType<typeof snapshotEncryptionConfig>;

  beforeEach(() => {
    configSnapshot = snapshotEncryptionConfig();
    configureEncryption();
  });

  afterEach(() => {
    restoreEncryptionConfig(configSnapshot);
  });

  function makeMockModel(columns: string[]) {
    class MockModel extends ActiveModel {
      static {
        include(this, AttributeRegistration);
      }
    }
    const model = Object.assign(MockModel, {
      columnNames: () => columns,
      generatedAttributeMethods,
    });
    return model as typeof model & { encryptedAttributes: Set<string> };
  }

  it("wires the case-preserving original_<name> column when ignoreCase is set", () => {
    const modelClass = makeMockModel(["name", "original_name"]);
    encrypts.call(modelClass, "name", { deterministic: true, ignoreCase: true });
    const encrypted = modelClass.encryptedAttributes;
    expect(encrypted.has("name")).toBe(true);
    expect(encrypted.has("original_name")).toBe(true);
  });

  it("does not wire original_<name> when ignoreCase is absent", () => {
    const modelClass = makeMockModel(["name"]);
    encrypts.call(modelClass, "name", { deterministic: true });
    expect(modelClass.encryptedAttributes.has("original_name")).toBe(false);
  });

  it("raises when the original_<name> column is missing and supportUnencryptedData is false", () => {
    Encryption.config.supportUnencryptedData = false;
    const modelClass = makeMockModel(["name"]);
    expect(() =>
      encrypts.call(modelClass, "name", { deterministic: true, ignoreCase: true }),
    ).toThrow(/must create an additional column named 'original_name'/);
  });

  it("does not raise while no columns are known (schema not loaded yet)", () => {
    const modelClass = makeMockModel([]);
    expect(() =>
      encrypts.call(modelClass, "name", { deterministic: true, ignoreCase: true }),
    ).not.toThrow();
  });

  it("does not raise when supportUnencryptedData is true even if the column is missing", () => {
    Encryption.config.supportUnencryptedData = true;
    const modelClass = makeMockModel(["id", "name"]);
    expect(() =>
      encrypts.call(modelClass, "name", { deterministic: true, ignoreCase: true }),
    ).not.toThrow();
  });
});

describe("EncryptableRecord — ignore_case original_<name> column requirement", () => {
  let configSnapshot: ReturnType<typeof snapshotEncryptionConfig>;

  beforeEach(() => {
    configSnapshot = snapshotEncryptionConfig();
    configureEncryption();
    Encryption.config.supportUnencryptedData = false;
  });

  afterEach(() => {
    restoreEncryptionConfig(configSnapshot);
  });

  it("Base.encrypts ignoreCase raises ConfigurationError when original_<name> is missing", async () => {
    const adapter = await freshAdapter();
    const Model = class extends Base {
      static _tableName = "authors";
    };
    await Model.loadSchema();
    expect(() => {
      Model.encrypts("name", { deterministic: true, ignoreCase: true });
    }).toThrow(/must create an additional column named 'original_name'/);
  });

  it("Base.encrypts ignoreCase does not raise after reflection when original_<name> is present", async () => {
    const adapter = await freshAdapter();
    const Model = class extends Base {
      static _tableName = "encrypted_books";
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("original_name", "string");
        this.encrypts("name", { deterministic: true, ignoreCase: true });
      }
    };
    await Model.loadSchema();
    expect(() => new Model()).not.toThrow();
  });
});
