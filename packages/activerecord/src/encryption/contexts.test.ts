// vendor/rails/activerecord/test/cases/encryption/contexts_test.rb
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { Base } from "../index.js";
import "../relation.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { TEST_SCHEMA } from "../test-helpers/test-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";
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

setupHandlerSuite();
useHandlerTransactionalFixtures();

describe("ActiveRecord::Encryption::ContextsTest", () => {
  let configSnapshot: ReturnType<typeof snapshotEncryptionConfig>;
  let EncryptedPost: typeof Base;
  let EncryptedBook: typeof Base;
  let post: any;
  let titleCleartext: unknown;
  let titleCiphertext: unknown;

  beforeAll(async () => {
    await defineSchema({
      // `encrypted_posts` is not a canonical table: Rails' EncryptedPost rides the
      // `posts` table, but our (larger, double-base64'd — see the skip note in
      // encryptable-record.test.ts) ciphertext would be truncated by `posts.title`'s
      // default VARCHAR(255) on MySQL. A dedicated table with limit-1024 ciphertext
      // columns is required, so this entry stays inline rather than canonical.
      // eslint-disable-next-line blazetrails/require-canonical-schema
      encrypted_posts: {
        title: { type: "string", limit: 1024 },
        body: { type: "string", limit: 1024 },
      },
      encrypted_books: TEST_SCHEMA.encrypted_books,
    });
  });

  beforeEach(async () => {
    configSnapshot = snapshotEncryptionConfig();
    Configurable.config.previousSchemes = [];
    configureEncryption();
    Configurable.config.supportUnencryptedData = true;

    // Models are defined inline (rather than via the makeEncryptedPost /
    // makeEncryptedBook factories) because those factories pin `this.adapter`
    // to a passed adapter, which bypasses the connection handler and would put
    // writes outside the per-test BEGIN/ROLLBACK savepoint that
    // useHandlerTransactionalFixtures relies on. The sibling handler-suite
    // encryption test (uniqueness-validations.test.ts) hand-rolls models for
    // the same reason. They are also defined after configureEncryption so
    // encrypts() builds the scheme against the configured key material
    // (otherwise buildScheme falls back to the legacy AR_ENC placeholder
    // encryptor).
    EncryptedPost = class EncryptedPost extends Base {
      static {
        this._tableName = "encrypted_posts";
        this.attribute("id", "integer");
        this.attribute("title", "string", { limit: 1024 });
        this.attribute("body", "string", { limit: 1024 });
        this.encrypts("title");
        this.encrypts("body");
      }
    };

    EncryptedBook = class EncryptedBook extends Base {
      static {
        this._tableName = "encrypted_books";
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
    // Reload so before-type-cast holds the persisted ciphertext (TS keeps the
    // in-memory before-type-cast as plaintext until the row is re-read).
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
    // Rails passes `"Dune".encode(Encoding::BINARY)` to exercise the
    // NullEncryptor.isBinary() === false gate in encryptAsText. TS strings
    // carry no binary encoding, so this payload is degenerate and the binary
    // gate itself can't be meaningfully driven here — the actual binary-column
    // encryption path is covered by makeEncryptedBookWithBinary in
    // encryptable-record.test.ts. This test retains the name-for-name parity
    // and still asserts the create-under-NullEncryptor path doesn't raise.
    await expect(
      Contexts.withoutEncryption(() => (EncryptedBook as any).createBang({ name: "Dune" })),
    ).resolves.toBeDefined();
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
      // Rails asserts `assert_equal book, find_by(...)`; AR record equality is
      // class + id, so check both rather than id alone.
      expect(found).toBeInstanceOf(EncryptedBook);
      expect(found?.id).toBe(book.id);
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
