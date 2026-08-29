import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "../index.js";
import "../relation.js";
import { fixtures } from "../test-fixtures.js";
import {
  configureEncryption,
  snapshotEncryptionConfig,
  restoreEncryptionConfig,
  assertEncryptedAttribute,
  assertNotEncryptedAttribute,
} from "./test-helpers.js";
import { Configurable } from "./configurable.js";
import { Contexts } from "./contexts.js";
import { NullEncryptor } from "./null-encryptor.js";
import { Configuration as ConfigurationError } from "./errors.js";
import { RecordInvalid } from "../validations.js";

fixtures([]);

describe("ActiveRecord::Encryption::ContextsTest", () => {
  let configSnapshot: ReturnType<typeof snapshotEncryptionConfig>;
  let EncryptedPost: typeof Base;
  let EncryptedBook: typeof Base;
  let post: any;
  let titleCleartext: unknown;
  let titleCiphertext: unknown;

  beforeEach(async () => {
    configSnapshot = snapshotEncryptionConfig();
    Configurable.config.previousSchemes = [];
    configureEncryption();
    Configurable.config.supportUnencryptedData = true;

    EncryptedPost = class EncryptedPost extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.encrypts("title");
        this.encrypts("body");
      }
    };

    EncryptedBook = class EncryptedBook extends Base {
      static {
        this._tableName = "encrypted_books";
        this.attribute("created_at", "datetime");
        this.attribute("updated_at", "datetime");
        this.attribute("id", "integer");
        this.attribute("name", "string", { default: "<untitled>", limit: 1024 });
        this.encrypts("name", { deterministic: true });
      }
    };

    post = await (EncryptedPost as any).createBang({
      title: "Some encrypted post title",
      body: "Some body",
    });
    titleCleartext = post.title;
    await post.reload();
    titleCiphertext = post.ciphertextFor("title");
  });

  afterEach(() => {
    restoreEncryptionConfig(configSnapshot);
  });

  it(".with_encryption_context lets you override properties", async () => {
    await Contexts.withEncryptionContext({ encryptor: new NullEncryptor() }, async () => {
      expect((await post.reload()).title).toBe(titleCiphertext);

      await post.updateBang({ title: "Some new title" });
    });

    expect(post.readAttributeBeforeTypeCast("title")).toBe("Some new title");
  });

  it(".with_encryption_context will restore previous context properties when there is an error", async () => {
    try {
      await Contexts.withEncryptionContext({ encryptor: new NullEncryptor() }, () => {
        throw new Error("Some error");
      });
    } catch {
      await assertEncryptedAttribute(await post.reload(), "title", titleCleartext);
    }
  });

  it(".with_encryption_context can be nested multiple times", () => {
    const encryptor1 = new NullEncryptor();
    Contexts.withEncryptionContext({ encryptor: encryptor1 }, () => {
      expect(Configurable.encryptor).toBe(encryptor1);

      const encryptor2 = new NullEncryptor();
      Contexts.withEncryptionContext({ encryptor: encryptor2 }, () => {
        expect(Configurable.encryptor).toBe(encryptor2);

        const encryptor3 = new NullEncryptor();
        Contexts.withEncryptionContext({ encryptor: encryptor3 }, () => {
          expect(Configurable.encryptor).toBe(encryptor3);
        });

        expect(Configurable.encryptor).toBe(encryptor2);
      });

      expect(Configurable.encryptor).toBe(encryptor1);
    });
  });

  it(".without_encryption won't decrypt or encrypt data automatically", async () => {
    await Contexts.withoutEncryption(async () => {
      expect((await post.reload()).title).toBe(titleCiphertext);

      await post.updateBang({ title: "Some new title" });
    });

    assertNotEncryptedAttribute(post, "title", "Some new title");
  });

  it(".without_encryption doesn't raise on binary encoded data", async () => {
    await expect(
      Contexts.withoutEncryption(() => (EncryptedBook as any).createBang({ name: "Dune" })),
    ).resolves.not.toThrow();
  });

  it(".protecting_encrypted_data don't decrypt attributes automatically", async () => {
    await Contexts.protectingEncryptedData(async () => {
      expect((await post.reload()).title).toBe(titleCiphertext);
    });
  });

  it(".protecting_encrypted_data allows db-queries on deterministic attributes", async () => {
    const book = await (EncryptedBook as any).createBang({ name: "Dune" });

    await Contexts.protectingEncryptedData(async () => {
      const found = await (EncryptedBook as any).findBy({ name: "Dune" });
      expect(found?.id).toEqual(book.id);
    });
  });

  it("can't encrypt or decrypt in protected mode", async () => {
    await Contexts.protectingEncryptedData(async () => {
      await expect(post.encrypt()).rejects.toThrow(ConfigurationError);

      await expect(post.decrypt()).rejects.toThrow(ConfigurationError);
    });
  });

  it(".protecting_encrypted_data will raise a validation error when modifying encrypting attributes", async () => {
    await Contexts.protectingEncryptedData(async () => {
      await expect(post.updateBang({ title: "Some new title" })).rejects.toThrow(RecordInvalid);
    });
  });
});
