import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  freshAdapter,
  configureEncryption,
  snapshotEncryptionConfig,
  restoreEncryptionConfig,
  makeEncryptedPost,
  makeEncryptedBook,
  makeEncryptedBookWithDowncaseName,
  makeEncryptedBookIgnoreCase,
  makeEncryptedAuthor,
  makeBookThatWillFailToEncryptName,
  makeFreshModel,
  makeKeyProvider,
  assertEncryptedAttribute,
  ciphertextFor,
  withEncryptionContext,
  withoutEncryption,
  DecryptionError,
  EncryptionError,
  AUTHOR_NAME_LIMIT,
} from "./test-helpers.js";
import { Configurable } from "./configurable.js";
import { EncryptableRecord } from "./encryptable-record.js";
import { isEncryptedAttribute } from "../encryption.js";

describe("ActiveRecord::Encryption::EncryptableRecordTest", () => {
  let configSnapshot: ReturnType<typeof snapshotEncryptionConfig>;

  beforeEach(() => {
    configSnapshot = snapshotEncryptionConfig();
    Configurable.config.previousSchemes = [];
    configureEncryption();
  });

  afterEach(() => {
    restoreEncryptionConfig(configSnapshot);
  });

  it("encrypts the attribute seamlessly when creating and updating records", async () => {
    const Post = makeEncryptedPost(freshAdapter());
    const post = await Post.create({ title: "The Starfleet is here!", body: "take cover!" });
    assertEncryptedAttribute(post, "title", "The Starfleet is here!");

    await post.update({ title: "The Klingons are coming!" });
    assertEncryptedAttribute(post, "title", "The Klingons are coming!");

    post.title = "You sure?";
    await post.save();
    assertEncryptedAttribute(post, "title", "You sure?");
  });

  it("attribute is not accessible with the wrong key", async () => {
    Configurable.config.supportUnencryptedData = false;
    const Post = makeEncryptedPost(freshAdapter());
    const post = await Post.create({ title: "The Starfleet is here!", body: "take cover!" });

    await expect(
      withEncryptionContext(
        { keyProvider: makeKeyProvider("a-different-key-for-testing-purposes!!") },
        async () => {
          const reloaded = await Post.find(post.id);
          return reloaded.title;
        },
      ),
    ).rejects.toThrow(DecryptionError);
  });

  it("swapping key_providers via with_encryption_context", async () => {
    const Post = makeEncryptedPost(freshAdapter());
    const keyProvider1 = makeKeyProvider("key-provider-one-for-testing-32b!!");
    const keyProvider2 = makeKeyProvider("key-provider-two-for-testing-32b!!");

    const post1 = await withEncryptionContext({ keyProvider: keyProvider1 }, () =>
      Post.create({ title: "post1!", body: "first post!" }),
    );
    const post2 = await withEncryptionContext({ keyProvider: keyProvider2 }, () =>
      Post.create({ title: "post2!", body: "second post!" }),
    );

    await expect(
      withEncryptionContext({ keyProvider: keyProvider2 }, async () => {
        const r = await Post.find(post1.id);
        return r.title;
      }),
    ).rejects.toThrow(DecryptionError);

    const title1 = await withEncryptionContext({ keyProvider: keyProvider1 }, async () => {
      const r = await Post.find(post1.id);
      return r.title;
    });
    expect(title1).toBe("post1!");

    const title2 = await withEncryptionContext({ keyProvider: keyProvider2 }, async () => {
      const r = await Post.find(post2.id);
      return r.title;
    });
    expect(title2).toBe("post2!");
  });

  it("ignores nil values", async () => {
    const Book = makeEncryptedBook(freshAdapter());
    const book = await Book.create({ name: null });
    expect(book.name).toBeNull();
  });

  it("ignores empty values", async () => {
    const Book = makeEncryptedBook(freshAdapter());
    const book = await Book.create({ name: "" });
    // Rails serializes empty strings the same as any other value (encrypts them).
    // "ignores" means the value round-trips correctly, not that encryption is skipped.
    expect(book.name).toBe("");
    // Verify the DB-bound value is ciphertext, not the empty string itself.
    const dbValues = book._attributes.valuesForDatabase();
    expect(dbValues.name).not.toBe("");
    expect(dbValues.name).not.toBeNull();
    const reloaded = await Book.find(book.id);
    expect(reloaded.name).toBe("");
  });

  it("can configure a custom key provider on a per-record-class basis through the :key_provider option", async () => {
    const keyProvider = makeKeyProvider("custom-post-body-key-provider-32b!!");
    // Use makeFreshModel to avoid the idempotency guard that skips re-encrypting
    // an attribute already wrapped with EncryptedAttributeType.
    const Post = makeFreshModel(freshAdapter(), { id: "integer", title: "string", body: "string" });
    Post.encrypts("title");
    Post.encrypts("body", { keyProvider });

    const post = await Post.create({ title: "The Starfleet is here!", body: "take cover!" });
    assertEncryptedAttribute(post, "body", "take cover!");

    // Verify round-trip: reload and decrypt using the scheme's own key provider.
    const reloaded = await Post.find(post.id);
    expect(reloaded.body).toBe("take cover!");
  });

  it("can configure a custom key on a per-record-class basis through the :key option", async () => {
    const customKey = "a-custom-key-for-author-32bytes!!";
    const Author = makeFreshModel(freshAdapter(), { id: "integer", name: "string" });
    Author.encrypts("name", { key: customKey });

    const author = await Author.create({ name: "Stephen King" });
    assertEncryptedAttribute(author, "name", "Stephen King");

    // Verify round-trip: reload and decrypt using the scheme's own key.
    const reloaded = await Author.find(author.id);
    expect(reloaded.name).toBe("Stephen King");
  });

  it("encrypts multiple attributes with different options at the same time", async () => {
    const Post = makeEncryptedPost(freshAdapter());
    const title = "The Starfleet is here!";
    const body = "<p>the Starfleet is here, we are safe now!</p>";
    const post = await Post.create({ title, body });
    assertEncryptedAttribute(post, "title", title);
    assertEncryptedAttribute(post, "body", body);
  });

  it("encrypted_attributes returns the list of encrypted attributes in a model (each record class holds their own list)", () => {
    const Post = makeEncryptedPost(freshAdapter());
    const Author = makeEncryptedAuthor(freshAdapter());
    new Post();
    new Author();
    expect(EncryptableRecord.encryptedAttributes(Post)).toEqual(new Set(["title", "body"]));
    expect(EncryptableRecord.encryptedAttributes(Author)).toEqual(new Set(["name"]));
    expect(EncryptableRecord.encryptedAttributes(Post)).not.toEqual(
      EncryptableRecord.encryptedAttributes(Author),
    );
  });

  it("deterministic_encrypted_attributes returns the list of deterministic encrypted attributes in a model (each record class holds their own list)", () => {
    const Book = makeEncryptedBook(freshAdapter());
    const Post = makeEncryptedPost(freshAdapter());
    new Book();
    new Post();
    expect(EncryptableRecord.deterministicEncryptedAttributes(Book)).toEqual(new Set(["name"]));
    expect(EncryptableRecord.deterministicEncryptedAttributes(Post).size).toBe(0);
  });

  it("by default, encryption is not deterministic", async () => {
    const Post = makeEncryptedPost(freshAdapter());
    const post1 = await Post.create({ title: "the same title", body: "some body" });
    const post2 = await Post.create({ title: "the same title", body: "some body" });
    expect(ciphertextFor(post1, "title")).not.toBe(ciphertextFor(post2, "title"));
  });

  it("deterministic attributes can be searched with Active Record queries", async () => {
    const Book = makeEncryptedBook(freshAdapter());
    await Book.create({ name: "Dune" });
    expect(await Book.findBy({ name: "Dune" })).not.toBeNull();
    expect(await Book.findBy({ name: "not Dune" })).toBeNull();
    expect(await Book.where({ name: "Dune" }).count()).toBe(1);
  });

  it("deterministic attributes can be created by passing deterministic: true", async () => {
    const Book = makeEncryptedBook(freshAdapter());
    const book1 = await Book.create({ name: "Dune" });
    const book2 = await Book.create({ name: "Dune" });
    expect(ciphertextFor(book1, "name")).toBe(ciphertextFor(book2, "name"));
  });

  it("can work with pre-encryption nil values", async () => {
    Configurable.config.supportUnencryptedData = true;
    const Book = makeEncryptedBook(freshAdapter());
    const book = await withoutEncryption(() => Book.create({ name: null }));
    expect(book.name).toBeNull();
  });

  it("can work with pre-encryption empty values", async () => {
    Configurable.config.supportUnencryptedData = true;
    const Book = makeEncryptedBook(freshAdapter());
    const book = await withoutEncryption(() => Book.create({ name: "" }));
    expect(book.name).toBe("");
  });

  it("reading a not encrypted value won't raise a Decryption error when :support_unencrypted_data is true", async () => {
    Configurable.config.supportUnencryptedData = true;
    const Author = makeEncryptedAuthor(freshAdapter());
    const author = await withoutEncryption(() => Author.create({ name: "Stephen King" }));
    const reloaded = await Author.find(author.id);
    expect(reloaded.name).toBe("Stephen King");
  });

  it("reading a not encrypted value will raise a Decryption error when :support_unencrypted_data is false", async () => {
    Configurable.config.supportUnencryptedData = false;
    const Author = makeEncryptedAuthor(freshAdapter());
    const author = await withoutEncryption(() => Author.create({ name: "Stephen King" }));

    await expect(
      (async () => {
        const reloaded = await Author.find(author.id);
        return reloaded.name;
      })(),
    ).rejects.toThrow(DecryptionError);
  });

  it("by default, it's case sensitive", async () => {
    const Book = makeEncryptedBook(freshAdapter());
    await Book.create({ name: "Dune" });
    expect(await Book.findBy({ name: "Dune" })).not.toBeNull();
    expect(await Book.findBy({ name: "dune" })).toBeNull();
  });

  it("when using downcase: true it ignores case since everything will be downcase", async () => {
    const Book = makeEncryptedBookWithDowncaseName(freshAdapter());
    await Book.create({ name: "Dune" });
    expect(await Book.findBy({ name: "Dune" })).not.toBeNull();
    expect(await Book.findBy({ name: "dune" })).not.toBeNull();
    expect(await Book.findBy({ name: "DUNE" })).not.toBeNull();
  });

  it("when downcase: true it creates content downcased", async () => {
    const Book = makeEncryptedBookWithDowncaseName(freshAdapter());
    await Book.create({ name: "Dune" });
    const found = await Book.findBy({ name: "dune" });
    expect(found).not.toBeNull();
    expect(found!.name).toBe("dune");
  });

  it("when ignore_case: true, it ignores case in queries but keep it when reading the attribute", async () => {
    const Book = makeEncryptedBookIgnoreCase(freshAdapter());
    new Book();
    await Book.create({ name: "Dune" });
    const book = await Book.findBy({ name: "dune" });
    expect(book).not.toBeNull();
    expect(book!.name).toBe("Dune");
  });

  it("when ignore_case: true, it lets you update attributes normally", async () => {
    const Book = makeEncryptedBookIgnoreCase(freshAdapter());
    const book = await Book.create({ name: "Dune" });
    await book.update({ name: "Dune II" });
    expect(book.name).toBe("Dune II");
  });

  it("won't change the encoding of strings", async () => {
    const Author = makeEncryptedAuthor(freshAdapter());
    const author = await Author.create({ name: "Jorge" });
    const reloaded = await Author.find(author.id);
    expect(typeof reloaded.name).toBe("string");
    expect(reloaded.name).toBe("Jorge");
  });

  it("track previous changes properly for encrypted attributes", async () => {
    const Book = makeEncryptedBook(freshAdapter());
    const book = await Book.create({ name: "Dune" });
    await book.update({ name: "A new title!" });
    // After updating the encrypted attribute, it appears in previousChanges.
    expect("name" in book.previousChanges).toBe(true);
  });

  it.skip("encryption schemes are resolved when used, not when declared", () => {
    // Global previous schemes (config.previous) are baked into the scheme at
    // encrypts() time. Supporting lazy re-evaluation after configure() requires
    // making globalPreviousSchemesFor run at serialize/deserialize time, not at
    // class definition time — a larger refactor.
  });

  it("isEncryptedAttribute identifies encrypted vs plain attributes", () => {
    const Post = makeEncryptedPost(freshAdapter());
    new Post();
    expect(isEncryptedAttribute(Post, "title")).toBe(true);
    expect(isEncryptedAttribute(Post, "body")).toBe(true);
    expect(isEncryptedAttribute(Post, "id")).toBe(false);
  });

  it.skip("encrypts serialized attributes", () => {});
  it.skip("encrypts serialized attributes where encrypts is declared first", () => {});
  it.skip("encrypts store attributes with accessors", () => {});
  it("encryption errors when saving records will raise the error and don't save anything", async () => {
    const Book = makeBookThatWillFailToEncryptName(freshAdapter());
    new Book();
    const countBefore = await Book.count();
    await expect(Book.create({ name: "Dune" })).rejects.toThrow(EncryptionError);
    expect(await Book.count()).toBe(countBefore);
  });

  it("can't modify encrypted attributes when frozen_encryption is true", async () => {
    const Post = makeEncryptedPost(freshAdapter());
    new Post();
    const post = await Post.create({ title: "Original", body: "body" });
    post.title = "Some new title";
    expect(post.isValid()).toBe(true);
    withEncryptionContext({ frozenEncryption: true }, () => {
      expect(post.isValid()).toBe(false);
    });
  });

  it("can only save unencrypted attributes when frozen encryption is true", async () => {
    // Build a model with one encrypted (name) and one non-encrypted (notes) attribute.
    const adp = freshAdapter();
    const Article = makeFreshModel(adp, { id: "integer", name: "string", notes: "string" });
    Article.encrypts("name");
    new Article();
    const article = await Article.create({ name: "Dune", notes: "original" });
    // Updating a non-encrypted attribute via save succeeds even when frozen.
    await withEncryptionContext({ frozenEncryption: true }, async () => {
      article.notes = "updated";
      await article.save();
    });
    const reloaded = await Article.find(article.id);
    expect(reloaded.notes).toBe("updated");
    // Updating an encrypted attribute fails validation when frozen.
    withEncryptionContext({ frozenEncryption: true }, () => {
      article.name = "New title";
      expect(article.isValid()).toBe(false);
      expect(article.errors.added("name", "can't be modified because it is encrypted")).toBe(true);
    });
  });
  it("validate column sizes", async () => {
    const Author = makeEncryptedAuthor(freshAdapter());
    new Author();
    expect(new Author({ name: "jorge" }).isValid()).toBe(true);
    expect(new Author({ name: "a".repeat(AUTHOR_NAME_LIMIT + 1) }).isValid()).toBe(false);
    const author = await Author.create({ name: "a".repeat(AUTHOR_NAME_LIMIT + 1) });
    expect(author.isValid()).toBe(false);
  });

  it("forces UTF-8 encoding for deterministic attributes by default", async () => {
    // UTF-8 is the default — JS strings are always valid Unicode so this is
    // a no-op, but the feature must not break normal round-trips.
    const Book = makeEncryptedBook(freshAdapter());
    new Book();
    const book = await Book.create({ name: "Dune" });
    const reloaded = await Book.find(book.id);
    expect(reloaded.name).toBe("Dune");
  });

  it("forces encoding for deterministic attributes based on the configured option", async () => {
    // ASCII encoding: non-ASCII chars (> 0x7F) are replaced with "?" so two
    // strings that differ only in non-ASCII content produce the same ciphertext.
    Configurable.config.forcedEncodingForDeterministicEncryption = "ASCII";
    const adp = freshAdapter();
    const Book = makeEncryptedBook(adp);
    new Book();
    const book = await Book.create({ name: "Helló" });
    const normalized = await Book.create({ name: "Hell?" });
    expect(ciphertextFor(book, "name")).toBe(ciphertextFor(normalized, "name"));
    const reloaded = await Book.find(book.id);
    expect(reloaded.name).toBe("Hell?");
  });

  it("forced encoding for deterministic attributes will replace invalid characters", async () => {
    // ASCII encoding replaces chars > 0x7F with "?".
    Configurable.config.forcedEncodingForDeterministicEncryption = "ASCII";
    const Book = makeEncryptedBook(freshAdapter());
    new Book();
    const book = await Book.create({ name: "Hello üñ" });
    const reloaded = await Book.find(book.id);
    expect(reloaded.name).toBe("Hello ??");
  });

  it("forced encoding for deterministic attributes can be disabled", async () => {
    // With forced encoding disabled (""), non-ASCII chars are preserved as-is.
    Configurable.config.forcedEncodingForDeterministicEncryption = "";
    const adp = freshAdapter();
    const Book = makeEncryptedBook(adp);
    new Book();
    const book = await Book.create({ name: "Helló" });
    const unrelated = await Book.create({ name: "Hell?" });
    // Different values -> different ciphertexts (no normalization flattens them).
    expect(ciphertextFor(book, "name")).not.toBe(ciphertextFor(unrelated, "name"));
    const reloaded = await Book.find(book.id);
    expect(reloaded.name).toBe("Helló");
  });

  it("support encrypted attributes defined on columns with default values", async () => {
    const Book = makeEncryptedBook(freshAdapter());
    new Book();
    const book = await Book.create({});
    assertEncryptedAttribute(book, "name", "<untitled>");
  });

  it.skip("loading records with encrypted attributes defined on columns with default values", () => {
    // requires upsert/insert_on_duplicate_update support
  });
  it.skip("can dump and load records that use encryption", () => {});
  it.skip("supports decrypting data encrypted non deterministically with SHA1 when digest class is SHA256", () => {});
  it("when ignore_case: true, it keeps both the attribute and the _original counterpart encrypted", async () => {
    const Book = makeEncryptedBookIgnoreCase(freshAdapter());
    new Book();
    const book = await Book.create({ name: "Dune" });
    assertEncryptedAttribute(book, "name", "Dune");
    assertEncryptedAttribute(book, "original_name", "Dune");
    // In-memory read before save reflects the assigned value immediately.
    const unsaved = new Book({ name: "Arrakis" });
    expect(unsaved.name).toBe("Arrakis");
    // Null-clearing: assigning null clears original_name and returns null.
    unsaved.name = null;
    expect(unsaved.name).toBeNull();
  });

  it("when ignore_case: true, it returns the actual value when not encrypted", async () => {
    Configurable.config.supportUnencryptedData = true;
    const Book = makeEncryptedBookIgnoreCase(freshAdapter());
    new Book();
    const book = await withoutEncryption(async () => Book.create({ name: "Dune" }));
    expect(book.name).toBe("Dune");
  });

  it("when ignore_case: true, users can override accessors and call super", async () => {
    const Book = makeEncryptedBookIgnoreCase(freshAdapter());
    const OverridingBook = class extends Book {
      get name() {
        return `${super.name}-overridden`;
      }
    };
    new Book();
    await Book.create({ name: "Dune" });
    const found = await Book.findBy({ name: "dune" });
    expect(found).not.toBeNull();
    const overridingInstance = found!.becomes(OverridingBook);
    expect(overridingInstance.name).toBe("Dune-overridden");
  });
  it.skip("binary data can be encrypted", () => {});
  it.skip("binary data can be encrypted uncompressed", () => {});
  it.skip("serialized binary data can be encrypted", () => {});
  it.skip("deterministic ciphertexts remain constant", () => {});
  it.skip("can compress data with custom compressor", () => {});
  it("type method returns cast type", () => {
    const Book = makeEncryptedBook(freshAdapter());
    new Book();
    const Post = makeEncryptedPost(freshAdapter());
    new Post();
    expect((Book as any).typeForAttribute("name").type()).toBe("string");
    expect((Post as any).typeForAttribute("body").type()).toBe("string");
  });

  it("encrypts normalized data", async () => {
    // Both NormalizedFirst and NormalizedSecond use downcase:true normalization.
    const adp = freshAdapter();
    const BookNormalized = makeFreshModel(adp, { id: "integer", name: "string", logo: "string" });
    BookNormalized.encrypts("name", { deterministic: true, downcase: true });
    BookNormalized.encrypts("logo", { deterministic: true, downcase: true });
    new BookNormalized();
    const b1 = await BookNormalized.create({ name: "Book" });
    assertEncryptedAttribute(await BookNormalized.find(b1.id), "name", "book");
    const b2 = await BookNormalized.create({ logo: "Book" });
    assertEncryptedAttribute(await BookNormalized.find(b2.id), "logo", "book");
  });

  it("encrypts attribute data", async () => {
    // The DB column stores ciphertext (text), while the cast type is date.
    // In Rails, encrypted attribute columns are always text in the schema.
    const adp = freshAdapter();
    const BookDate = makeFreshModel(adp, { id: "integer", name: "string" });
    await BookDate.create({ name: "bootstrap" }); // write triggers text column creation
    BookDate.attribute("name", "date"); // override cast type to date (DB stays text)
    BookDate.encrypts("name");
    const book = await BookDate.create({ name: "2024-01-01" });
    assertEncryptedAttribute(book, "name", new Date("2024-01-01"));
  });
});
