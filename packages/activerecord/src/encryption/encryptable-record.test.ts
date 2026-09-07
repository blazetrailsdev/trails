import { OpenSSL } from "@blazetrails/ruby-compat";
import { Temporal } from "@blazetrails/date";
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import {
  freshAdapter,
  configureEncryption,
  snapshotEncryptionConfig,
  restoreEncryptionConfig,
  makeEncryptedPost,
  makeEncryptedBook,
  makeEncryptedBookWithDowncaseName,
  makeEncryptedBookThatIgnoresCase,
  makeEncryptedAuthor,
  makeBookThatWillFailToEncryptName,
  makeEncryptedBookWithCustomCompressor,
  makeEncryptedTrafficLight,
  makeEncryptedTrafficLightWithStoreState,
  makeKeyProvider,
  assertEncryptedAttribute,
  ciphertextFor,
  withEncryptionContext,
  withoutEncryption,
  Decryption,
  Encryption,
  Base,
} from "./test-helpers.js";
import { Configurable } from "./configurable.js";
import { AttributeRegistration, Model as ActiveModel } from "@blazetrails/activemodel";
import { include } from "@blazetrails/activesupport";
import { itIfSupports } from "../support/supports.js";
import { currentAdapter } from "../support/adapter-helper.js";
import { fixtures } from "../test-fixtures.js";
import { withTransactionalFixtures } from "../test-fixtures/with-transactional-fixtures.js";
import {
  EncryptableRecord,
  decryptAttributes,
  deterministicEncryptedAttributes,
  encryptAttributes,
  encrypts,
  validateEncryptionAllowed,
} from "./encryptable-record.js";
import {
  EncryptedBook,
  EncryptedBookNormalizedFirst,
  EncryptedBookNormalizedSecond,
  EncryptedBookWithBinary,
  EncryptedBookWithSerializedFirstBinary,
  EncryptedBookWithSerializedSecondBinary,
} from "../test-helpers/models/book-encrypted.js";
import { isEncryptedAttribute } from "../encryption.js";
import { RecordInvalid } from "../index.js";

describe("ActiveRecord::Encryption::EncryptableRecordTest", () => {
  let configSnapshot: ReturnType<typeof snapshotEncryptionConfig>;

  let txnAdapter: Awaited<ReturnType<typeof freshAdapter>>;
  beforeAll(async () => {
    txnAdapter = await freshAdapter();
  });
  withTransactionalFixtures(() => txnAdapter);

  beforeEach(() => {
    configSnapshot = snapshotEncryptionConfig();
    Configurable.config.previousSchemes = [];
    configureEncryption();
  });

  afterEach(() => {
    restoreEncryptionConfig(configSnapshot);
  });

  it("encrypts the attribute seamlessly when creating and updating records", async () => {
    const Post = makeEncryptedPost(await freshAdapter());
    const post = await Post.create({ title: "The Starfleet is here!", body: "take cover!" });
    await assertEncryptedAttribute(post, "title", "The Starfleet is here!");

    await post.update({ title: "The Klingons are coming!" });
    await assertEncryptedAttribute(post, "title", "The Klingons are coming!");

    post.title = "You sure?";
    await post.save();
    await assertEncryptedAttribute(post, "title", "You sure?");
  });

  it("attribute is not accessible with the wrong key", async () => {
    Configurable.config.supportUnencryptedData = false;
    const Post = makeEncryptedPost(await freshAdapter());
    const post = await Post.create({ title: "The Starfleet is here!", body: "take cover!" });

    await expect(
      withEncryptionContext(
        { keyProvider: makeKeyProvider("a-different-key-for-testing-purposes!!") },
        async () => {
          const reloaded = await Post.find(post.id);
          return reloaded.title;
        },
      ),
    ).rejects.toThrow(Decryption);
  });

  it("swapping key_providers via with_encryption_context", async () => {
    const Post = makeEncryptedPost(await freshAdapter());
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
    ).rejects.toThrow(Decryption);

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
    const Book = makeEncryptedBook(await freshAdapter());
    const book = await Book.create({ name: null });
    expect(book.name).toBeNull();
  });

  it("ignores empty values", async () => {
    const Book = makeEncryptedBook(await freshAdapter());
    const book = await Book.create({ name: "" });
    expect(book.name).toBe("");
    const dbValues = book._attributes.valuesForDatabase();
    expect(dbValues.name).not.toBe("");
    expect(dbValues.name).not.toBeNull();
    const reloaded = await Book.find(book.id);
    expect(reloaded.name).toBe("");
  });

  it("can configure a custom key provider on a per-record-class basis through the :key_provider option", async () => {
    const keyProvider = makeKeyProvider("custom-post-body-key-provider-32b!!");
    const adp = await freshAdapter();
    const Post = class extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = adp;
        this.encrypts("title");
        this.encrypts("body", { keyProvider });
      }
    } as any;

    const post = await Post.create({ title: "The Starfleet is here!", body: "take cover!" });
    await assertEncryptedAttribute(post, "body", "take cover!");

    const reloaded = await Post.find(post.id);
    expect(reloaded.body).toBe("take cover!");
  });

  it("can configure a custom key on a per-record-class basis through the :key option", async () => {
    const customKey = "a-custom-key-for-author-32bytes!!";
    const adp = await freshAdapter();
    const Author = class extends Base {
      static {
        this._tableName = "authors";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adp;
        this.encrypts("name", { key: customKey });
      }
    } as any;

    const author = await Author.create({ name: "Stephen King" });
    await assertEncryptedAttribute(author, "name", "Stephen King");

    const reloaded = await Author.find(author.id);
    expect(reloaded.name).toBe("Stephen King");
  });

  it("encrypts multiple attributes with different options at the same time", async () => {
    const Post = makeEncryptedPost(await freshAdapter());
    const title = "The Starfleet is here!";
    const body = "<p>the Starfleet is here, we are safe now!</p>";
    const post = await Post.create({ title, body });
    await assertEncryptedAttribute(post, "title", title);
    await assertEncryptedAttribute(post, "body", body);
  });

  it("encrypted_attributes returns the list of encrypted attributes in a model (each record class holds their own list)", async () => {
    const Post = makeEncryptedPost(await freshAdapter());
    const Author = makeEncryptedAuthor(await freshAdapter());
    new Post();
    new Author();
    expect(Post.encryptedAttributes).toEqual(new Set(["title", "body"]));
    expect(Author.encryptedAttributes).toEqual(new Set(["name"]));
    expect(Post.encryptedAttributes).not.toEqual(Author.encryptedAttributes);
  });

  it("deterministic_encrypted_attributes returns the list of deterministic encrypted attributes in a model (each record class holds their own list)", async () => {
    const Book = makeEncryptedBook(await freshAdapter());
    const Post = makeEncryptedPost(await freshAdapter());
    new Book();
    new Post();
    expect(deterministicEncryptedAttributes.call(Book)).toEqual(new Set(["name"]));
    expect(deterministicEncryptedAttributes.call(Post).size).toBe(0);
  });

  it("by default, encryption is not deterministic", async () => {
    const Post = makeEncryptedPost(await freshAdapter());
    const post1 = await Post.create({ title: "the same title", body: "some body" });
    const post2 = await Post.create({ title: "the same title", body: "some body" });
    expect(ciphertextFor(post1, "title")).not.toBe(ciphertextFor(post2, "title"));
  });

  it("deterministic attributes can be searched with Active Record queries", async () => {
    const Book = makeEncryptedBook(await freshAdapter());
    await Book.create({ name: "Dune" });
    expect(await Book.findBy({ name: "Dune" })).not.toBeNull();
    expect(await Book.findBy({ name: "not Dune" })).toBeNull();
    expect(await Book.where({ name: "Dune" }).count()).toBe(1);
  });

  it("deterministic attributes can be created by passing deterministic: true", async () => {
    const Book = makeEncryptedBook(await freshAdapter());
    const book1 = await Book.create({ name: "Dune" });
    const book2 = await Book.create({ name: "Dune" });
    expect(ciphertextFor(book1, "name")).toBe(ciphertextFor(book2, "name"));
  });

  it("can work with pre-encryption nil values", async () => {
    Configurable.config.supportUnencryptedData = true;
    const Book = makeEncryptedBook(await freshAdapter());
    const book = await withoutEncryption(() => Book.create({ name: null }));
    expect(book.name).toBeNull();
  });

  it("can work with pre-encryption empty values", async () => {
    Configurable.config.supportUnencryptedData = true;
    const Book = makeEncryptedBook(await freshAdapter());
    const book = await withoutEncryption(() => Book.create({ name: "" }));
    expect(book.name).toBe("");
  });

  it("reading a not encrypted value won't raise a Decryption error when :support_unencrypted_data is true", async () => {
    Configurable.config.supportUnencryptedData = true;
    const Author = makeEncryptedAuthor(await freshAdapter());
    const author = await withoutEncryption(() => Author.create({ name: "Stephen King" }));
    const reloaded = await Author.find(author.id);
    expect(reloaded.name).toBe("Stephen King");
  });

  it("reading a not encrypted value will raise a Decryption error when :support_unencrypted_data is false", async () => {
    Configurable.config.supportUnencryptedData = false;
    const Author = makeEncryptedAuthor(await freshAdapter());
    const author = await withoutEncryption(() => Author.create({ name: "Stephen King" }));

    await expect(
      (async () => {
        const reloaded = await Author.find(author.id);
        return reloaded.name;
      })(),
    ).rejects.toThrow(Decryption);
  });

  it("by default, it's case sensitive", async () => {
    const Book = makeEncryptedBook(await freshAdapter());
    await Book.create({ name: "Dune" });
    expect(await Book.findBy({ name: "Dune" })).not.toBeNull();
    expect(await Book.findBy({ name: "dune" })).toBeNull();
  });

  it("when using downcase: true it ignores case since everything will be downcase", async () => {
    const Book = makeEncryptedBookWithDowncaseName(await freshAdapter());
    await Book.create({ name: "Dune" });
    expect(await Book.findBy({ name: "Dune" })).not.toBeNull();
    expect(await Book.findBy({ name: "dune" })).not.toBeNull();
    expect(await Book.findBy({ name: "DUNE" })).not.toBeNull();
  });

  it("when downcase: true it creates content downcased", async () => {
    const Book = makeEncryptedBookWithDowncaseName(await freshAdapter());
    await Book.create({ name: "Dune" });
    const found = await Book.findBy({ name: "dune" });
    expect(found).not.toBeNull();
    expect(found!.name).toBe("dune");
  });

  it("when ignore_case: true, it ignores case in queries but keep it when reading the attribute", async () => {
    const Book = makeEncryptedBookThatIgnoresCase(await freshAdapter());
    new Book();
    await Book.create({ name: "Dune" });
    const book = await Book.findBy({ name: "dune" });
    expect(book).not.toBeNull();
    expect(book!.name).toBe("Dune");
  });

  it("when ignore_case: true, it lets you update attributes normally", async () => {
    const Book = makeEncryptedBookThatIgnoresCase(await freshAdapter());
    const book = await Book.create({ name: "Dune" });
    await book.update({ name: "Dune II" });
    expect(book.name).toBe("Dune II");
  });

  it("won't change the encoding of strings", async () => {
    const Author = makeEncryptedAuthor(await freshAdapter());
    const author = await Author.create({ name: "Jorge" });
    const reloaded = await Author.find(author.id);
    expect(typeof reloaded.name).toBe("string");
    expect(reloaded.name).toBe("Jorge");
  });

  it("track previous changes properly for encrypted attributes", async () => {
    const Book = makeEncryptedBook(await freshAdapter());
    const book = await Book.create({ name: "Dune" });
    await book.update({ name: "A new title!" });
    expect("name" in book.previousChanges).toBe(true);
  });

  it("encryption schemes are resolved when used, not when declared", async () => {
    const adp = await freshAdapter();
    const Post = class extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adp;
      }
    } as any;
    Post.encrypts("title");

    Configurable.configure({
      primaryKey: "the primary key",
      deterministicKey: "the deterministic key",
      keyDerivationSalt: "the salt",
      supportSha1ForNonDeterministicEncryption: true,
    });

    const type = Post.typeForAttribute("title");
    expect(type.previousTypes).toHaveLength(1);
  });

  it("isEncryptedAttribute identifies encrypted vs plain attributes", async () => {
    const Post = makeEncryptedPost(await freshAdapter());
    new Post();
    expect(isEncryptedAttribute(Post, "title")).toBe(true);
    expect(isEncryptedAttribute(Post, "body")).toBe(true);
    expect(isEncryptedAttribute(Post, "id")).toBe(false);
  });

  it("encrypts serialized attributes", async () => {
    const states = ["green", "red"];
    const TrafficLight = makeEncryptedTrafficLight(await freshAdapter());
    const trafficLight = await TrafficLight.create({ state: states, long_state: states });

    await assertEncryptedAttribute(trafficLight, "state", states);
  });

  it("encrypts serialized attributes where encrypts is declared first", async () => {
    const adp = await freshAdapter();
    const EncryptedFirstTrafficLight = class extends Base {
      static {
        this._tableName = "traffic_lights";
        this.adapter = adp;
        this.attribute("id", "integer");
        this.attribute("state", "string");
        this.attribute("long_state", "string");
        this.attribute("created_at", "datetime");
        this.attribute("updated_at", "datetime");
        this.encrypts("state");
        this.serialize("state", { type: Array });
        this.serialize("long_state", { type: Array });
      }
    } as any;
    new EncryptedFirstTrafficLight();

    const states = ["green", "red"];
    const trafficLight = await EncryptedFirstTrafficLight.create({
      state: states,
      long_state: states,
    });

    const dbValue = trafficLight._attributes.valuesForDatabase()["state"] as string;
    expect(typeof dbValue).toBe("string");
    expect(dbValue).not.toBe(JSON.stringify(states));

    const reloaded = await EncryptedFirstTrafficLight.find(trafficLight.id);
    expect(reloaded.state).toEqual(states);
  });

  it("encrypts store attributes with accessors", async () => {
    const TrafficLight = makeEncryptedTrafficLightWithStoreState(await freshAdapter());
    const light = new TrafficLight();
    light.color = "red";
    light.long_state = ["green", "red"];
    await light.save();
    expect(light.color).toBe("red");
    await assertEncryptedAttribute(light, "state", { color: "red" });
  });
  it("encryption errors when saving records will raise the error and don't save anything", async () => {
    const Book = makeBookThatWillFailToEncryptName(await freshAdapter());
    new Book();
    const countBefore = await Book.count();
    await expect(Book.create({ name: "Dune" })).rejects.toThrow(Encryption);
    expect(await Book.count()).toBe(countBefore);
  });

  it("can't modify encrypted attributes when frozen_encryption is true", async () => {
    const Post = makeEncryptedPost(await freshAdapter());
    new Post();
    const post = await Post.create({ title: "Original", body: "body" });
    post.title = "Some new title";
    expect(await post.isValid()).toBe(true);
    await withEncryptionContext({ frozenEncryption: true }, async () => {
      expect(await post.isValid()).toBe(false);
    });
  });

  const authorNameLimitPresent = currentAdapter("Mysql2Adapter", "TrilogyAdapter");

  it.skipIf(!authorNameLimitPresent)("validate column sizes", async () => {
    const Author = makeEncryptedAuthor(await freshAdapter());
    new Author();
    await Author.loadSchema();
    const authorNameLimit = (Author.columnsHash()["name"] as { limit: number }).limit;
    const tooLong = "a".repeat(authorNameLimit + 1);
    expect(await new Author({ name: "jorge" }).isValid()).toBe(true);
    expect(await new Author({ name: tooLong }).isValid()).toBe(false);
    const author = await Author.create({ name: tooLong });
    expect(await author.isValid()).toBe(false);
  });

  it("forces UTF-8 encoding for deterministic attributes by default", async () => {
    const Book = makeEncryptedBook(await freshAdapter());
    new Book();
    const book = await Book.create({ name: "Dune" });
    const reloaded = await Book.find(book.id);
    expect(reloaded.name).toBe("Dune");
  });

  it("forces encoding for deterministic attributes based on the configured option", async () => {
    Configurable.config.forcedEncodingForDeterministicEncryption = "ASCII";
    const adp = await freshAdapter();
    const Book = makeEncryptedBook(adp);
    new Book();
    const book = await Book.create({ name: "Helló" });
    const normalized = await Book.create({ name: "Hell?" });
    expect(ciphertextFor(book, "name")).toBe(ciphertextFor(normalized, "name"));
    const reloaded = await Book.find(book.id);
    expect(reloaded.name).toBe("Hell?");
  });

  it("forced encoding for deterministic attributes will replace invalid characters", async () => {
    Configurable.config.forcedEncodingForDeterministicEncryption = "ASCII";
    const Book = makeEncryptedBook(await freshAdapter());
    new Book();
    const book = await Book.create({ name: "Hello üñ" });
    const reloaded = await Book.find(book.id);
    expect(reloaded.name).toBe("Hello ??");
  });

  it("forced encoding for deterministic attributes can be disabled", async () => {
    Configurable.config.forcedEncodingForDeterministicEncryption = "";
    const adp = await freshAdapter();
    const Book = makeEncryptedBook(adp);
    new Book();
    const book = await Book.create({ name: "Helló" });
    const unrelated = await Book.create({ name: "Hell?" });
    expect(ciphertextFor(book, "name")).not.toBe(ciphertextFor(unrelated, "name"));
    const reloaded = await Book.find(book.id);
    expect(reloaded.name).toBe("Helló");
  });

  it("support encrypted attributes defined on columns with default values", async () => {
    await freshAdapter();
    const book = await EncryptedBook.create({});
    await assertEncryptedAttribute(book, "name", "<untitled>");
  });

  itIfSupports(
    "insert_on_duplicate_update",
    "loading records with encrypted attributes defined on columns with default values",
    async () => {
      const Book = makeEncryptedBook(await freshAdapter());
      new Book();
      await Book.insert({ name: "<untitled>" });
      const book = await Book.last();
      expect(book.name).toBe("<untitled>");
    },
  );
  it("threads the reflected column default so a plaintext default deserializes without decrypting", async () => {
    const adapter = await freshAdapter();
    const Book = class ReflectionOnlyEncryptedBook extends Base {
      static {
        this._tableName = "encrypted_books";
        this.attribute("created_at", "datetime");
        this.attribute("updated_at", "datetime");
        this.adapter = adapter;
        this.encrypts("name", { deterministic: true });
      }
    } as any;
    await Book.loadSchema();

    Configurable.config.supportUnencryptedData = false;

    const book = await withoutEncryption(() => Book.create({}));
    expect(book.name).toBe("<untitled>");

    const reloaded = await Book.find(book.id);
    expect(reloaded.name).toBe("<untitled>");
  });

  it("threads the true column default, not an attribute() override, into the encrypted type", async () => {
    const adapter = await freshAdapter();
    const Book = class OverriddenDefaultEncryptedBook extends Base {
      static {
        this._tableName = "encrypted_books";
        this.attribute("created_at", "datetime");
        this.attribute("updated_at", "datetime");
        this.adapter = adapter;
        this.attribute("name", "string", { default: "OVERRIDE" });
        this.encrypts("name", { deterministic: true });
      }
    } as any;
    await Book.loadSchema();

    const type = Book.typeForAttribute("name");
    expect(type._default).toBe("<untitled>");

    Configurable.config.supportUnencryptedData = false;

    const book = await withoutEncryption(() => Book.create({ name: "<untitled>" }));
    const reloaded = await Book.find(book.id);
    expect(reloaded.name).toBe("<untitled>");
  });

  it("can dump and load records that use encryption", async () => {
    const Book = makeEncryptedBook(await freshAdapter());
    new Book();

    const book = await Book.create({ name: "Dune" });

    const rawValues = book._attributes.valuesForDatabase();

    const loadedBook = Book._instantiate(rawValues);

    expect(loadedBook.name).toBe("Dune");
  });
  it("supports decrypting data encrypted non deterministically with SHA1 when digest class is SHA256", async () => {
    Configurable.configure({
      primaryKey: "the primary key",
      deterministicKey: "the deterministic key",
      keyDerivationSalt: "the salt",
      supportSha1ForNonDeterministicEncryption: true,
    });

    const { KeyGenerator } = await import("./key-generator.js");
    const { DerivedSecretKeyProvider } = await import("./derived-secret-key-provider.js");

    const keyProviderSha1 = new DerivedSecretKeyProvider("the primary key", {
      keyGenerator: new KeyGenerator({ hashDigestClass: OpenSSL.Digest.SHA1 }),
    });
    const keyProviderSha256 = new DerivedSecretKeyProvider("the primary key", {
      keyGenerator: new KeyGenerator({ hashDigestClass: OpenSSL.Digest.SHA256 }),
    });

    const adp = await freshAdapter();
    const PostSha1 = class extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = adp;
        this.encrypts("title", { keyProvider: keyProviderSha1 });
      }
    } as any;
    new PostSha1();
    await PostSha1.create({ title: "Post 1", body: "body" });

    const PostSha256 = class extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = adp;
        this.encrypts("title", { keyProvider: keyProviderSha256 });
      }
    } as any;
    new PostSha256();

    const posts = await PostSha256.all();
    expect(posts.map((p: any) => p.title)).toContain("Post 1");
  });
  it("when ignore_case: true, it keeps both the attribute and the _original counterpart encrypted", async () => {
    const Book = makeEncryptedBookThatIgnoresCase(await freshAdapter());
    new Book();
    const book = await Book.create({ name: "Dune" });
    await assertEncryptedAttribute(book, "name", "Dune");
    await assertEncryptedAttribute(book, "original_name", "Dune");
    const unsaved = new Book({ name: "Arrakis" });
    expect(unsaved.name).toBe("Arrakis");
    unsaved.name = null;
    expect(unsaved.name).toBeNull();
  });

  it("when ignore_case: true, it returns the actual value when not encrypted", async () => {
    Configurable.config.supportUnencryptedData = true;
    const Book = makeEncryptedBookThatIgnoresCase(await freshAdapter());
    new Book();
    const book = await withoutEncryption(async () => Book.create({ name: "Dune" }));
    expect(book.name).toBe("Dune");
  });

  it("when ignore_case: true, users can override accessors and call super", async () => {
    const Book = makeEncryptedBookThatIgnoresCase(await freshAdapter());
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

  it("when ignore_case: true is declared before the attributes, the original_<name> reader still decrypts (replay-safe)", async () => {
    const adapter = await freshAdapter();
    const Book = class extends Base {
      static {
        this._tableName = "encrypted_books";
        this.adapter = adapter;
        this.encrypts("name", { deterministic: true, ignoreCase: true });
      }
    } as unknown as typeof Base & {
      create: (a: object) => Promise<any>;
      find: (id: any) => Promise<any>;
    };

    const book = await Book.create({ name: "Dune" });
    await assertEncryptedAttribute(book, "original_name", "Dune");

    const reloaded = await Book.find(book.id);
    expect((reloaded as unknown as { name: string }).name).toBe("Dune");
  });

  it("binary data can be encrypted", async () => {
    await freshAdapter();
    const Book = EncryptedBookWithBinary;
    const allBytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect((await Book.create({ logo: allBytes })).logo).toEqual(allBytes);
    expect((await Book.create({ logo: null })).logo).toBeNull();
    expect((await Book.create({ logo: new Uint8Array(0) })).logo).toEqual(new Uint8Array(0));
  });
  it("binary data can be encrypted uncompressed", async () => {
    await freshAdapter();
    const Book = EncryptedBookWithBinary;
    const lowBytes = Uint8Array.from({ length: 128 }, (_, i) => i);
    const highBytes = Uint8Array.from({ length: 128 }, (_, i) => i + 128);
    await assertEncryptedAttribute(await Book.create({ logo: lowBytes }), "logo", lowBytes);
    await assertEncryptedAttribute(await Book.create({ logo: highBytes }), "logo", highBytes);
  });
  it("serialized binary data can be encrypted", async () => {
    const jsonBytes = Array.from({ length: 96 }, (_, i) => String.fromCharCode(i + 32));
    await freshAdapter();
    await assertEncryptedAttribute(
      await EncryptedBookWithSerializedFirstBinary.create({ logo: jsonBytes }),
      "logo",
      jsonBytes,
    );
    await assertEncryptedAttribute(
      await EncryptedBookWithSerializedSecondBinary.create({ logo: jsonBytes }),
      "logo",
      jsonBytes,
    );
  });
  it("deterministic ciphertexts remain constant", async () => {
    const ciphertext =
      '{"p":"DIohhw==","h":{"iv":"wEPaDcJP3VNIxaiz","at":"X7+2xvvcu1k1if6Dy28Esw=="}}';
    const adapter = await freshAdapter();
    configureEncryption({
      primaryKey: "test master key",
      deterministicKey: "test deterministic key",
      keyDerivationSalt: "testing key derivation salt",
    });
    const Book = makeEncryptedBook(adapter);
    const book = await withoutEncryption(() => Book.create({ name: ciphertext }));
    const reloaded = await Book.find(book.id);
    expect(reloaded.name).toBe("Dune");
  });

  it("can compress data with custom compressor", async () => {
    const Book = makeEncryptedBookWithCustomCompressor(await freshAdapter());
    new Book();
    const name = "a".repeat(141);
    const book = await Book.create({ name });
    const reloaded = await Book.find(book.id);
    expect(reloaded.name).toMatch(/^\[compressed\] /);
    expect(reloaded.name).toBe("[compressed] " + name);
  });
  it("type method returns cast type", async () => {
    const Book = makeEncryptedBook(await freshAdapter());
    new Book();
    const Post = makeEncryptedPost(await freshAdapter());
    new Post();
    expect(Book.typeForAttribute("name").type()).toBe("string");
    expect(Post.typeForAttribute("body").type()).toBe("text");
  });

  it("encrypts normalized data", async () => {
    await freshAdapter();
    await assertEncryptedAttribute(
      await EncryptedBookNormalizedFirst.create({ name: "Book" }),
      "name",
      "book",
    );
    await assertEncryptedAttribute(
      await EncryptedBookNormalizedSecond.create({ name: "Book" }),
      "name",
      "book",
    );
    await assertEncryptedAttribute(
      await EncryptedBookNormalizedFirst.create({ logo: "Book" }),
      "logo",
      "book",
    );
    await assertEncryptedAttribute(
      await EncryptedBookNormalizedSecond.create({ logo: "Book" }),
      "logo",
      "book",
    );
  });

  it("EncryptableRecord.validateEncryptionAllowed throws when encryption is frozen", () => {
    withEncryptionContext({ frozenEncryption: true }, () => {
      expect(() => validateEncryptionAllowed.call({})).toThrow(
        "can't be modified because it is encrypted",
      );
    });
  });

  it("EncryptableRecord.validateEncryptionAllowed does not throw when encryption is not frozen", () => {
    expect(() => validateEncryptionAllowed.call({})).not.toThrow();
  });

  it("EncryptableRecord.cantModifyEncryptedAttributesWhenFrozen adds errors for changed encrypted attrs", async () => {
    const Post = makeEncryptedPost(await freshAdapter());
    new Post();
    const post = new Post({ title: "hello" });
    post.title = "changed";
    const errored: Array<[string, string]> = [];
    const proxy = Object.assign(Object.create(Object.getPrototypeOf(post)), post, {
      errors: { add: (attr: string, msg: string) => errored.push([attr, msg]) },
    });
    EncryptableRecord.cantModifyEncryptedAttributesWhenFrozen(proxy);
    expect(errored).toEqual([["title", "can't be modified because it is encrypted"]]);
  });

  it("EncryptableRecord.cantModifyEncryptedAttributesWhenFrozen adds no errors for unchanged attrs", async () => {
    const Post = makeEncryptedPost(await freshAdapter());
    new Post();
    const post = new Post({});
    const errored: Array<[string, string]> = [];
    const proxy = Object.assign(Object.create(Object.getPrototypeOf(post)), post, {
      errors: { add: (attr: string, msg: string) => errored.push([attr, msg]) },
    });
    EncryptableRecord.cantModifyEncryptedAttributesWhenFrozen(proxy);
    expect(errored).toEqual([]);
  });

  it("EncryptableRecord.encryptAttributes writes ciphertext to DB and keeps plaintext in memory", async () => {
    const adp = await freshAdapter();
    const Post = makeEncryptedPost(adp);
    new Post();
    const post = await Post.create({ title: "Hello", body: "World" });
    await assertEncryptedAttribute(post, "title", "Hello");
    await encryptAttributes.call(post);
    expect(post.title).toBe("Hello");
    await assertEncryptedAttribute(await Post.find(post.id), "title", "Hello");
  });

  it("EncryptableRecord.decryptAttributes stores plaintext in DB", async () => {
    Configurable.config.supportUnencryptedData = true;
    const adp = await freshAdapter();
    const Post = makeEncryptedPost(adp);
    new Post();
    const post = await Post.create({ title: "Hello", body: "World" });
    await assertEncryptedAttribute(post, "title", "Hello");
    await decryptAttributes.call(post);
    const reloaded = await Post.find(post.id);
    expect(reloaded.title).toBe("Hello");
  });

  it("encrypts attribute data", async () => {
    const adp = await freshAdapter();
    const BookDate = class extends Base {
      static {
        this._tableName = "encrypted_books";
        this.attribute("created_at", "datetime");
        this.attribute("updated_at", "datetime");
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adp;
      }
    } as any;
    await BookDate.create({ name: "bootstrap" });
    BookDate.attribute("name", "date");
    BookDate.encrypts("name");
    const book = await BookDate.create({ name: "2024-01-01" });
    await assertEncryptedAttribute(book, "name", Temporal.PlainDate.from("2024-01-01"));
  });
});

describe("ActiveRecord::Encryption::EncryptableRecordTest", () => {
  let restoreEncryption: (() => void) | undefined;
  beforeAll(() => {
    const snapshot = snapshotEncryptionConfig();
    Configurable.config.previousSchemes = [];
    configureEncryption();
    restoreEncryption = () => restoreEncryptionConfig(snapshot);
  });
  afterAll(() => {
    restoreEncryption?.();
  });

  const { encryptedBooks } = fixtures(["encryptedBooks"]);

  it("can only save unencrypted attributes when frozen encryption is true", async () => {
    const book = encryptedBooks("awdr");

    await withEncryptionContext({ frozenEncryption: true }, async () => {
      await book.updateBang({ updated_at: Temporal.Now.instant() });
    });

    await withEncryptionContext({ frozenEncryption: true }, async () => {
      await expect(book.updateBang({ name: "Some new title" })).rejects.toThrow(RecordInvalid);
    });
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
    return Object.assign(MockModel, {
      columnNames: () => columns,
    }) as any;
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
    Configurable.config.supportUnencryptedData = false;
    const modelClass = makeMockModel(["name"]);
    expect(() =>
      encrypts.call(modelClass, "name", { deterministic: true, ignoreCase: true }),
    ).toThrow(/must create an additional column named 'original_name'/);
  });
});

describe("EncryptableRecord — ignore_case original_<name> column requirement", () => {
  let configSnapshot: ReturnType<typeof snapshotEncryptionConfig>;

  beforeEach(() => {
    configSnapshot = snapshotEncryptionConfig();
    configureEncryption();
    Configurable.config.supportUnencryptedData = false;
  });

  afterEach(() => {
    restoreEncryptionConfig(configSnapshot);
  });

  it("raises when columns are known and the original_<name> column is missing", () => {
    expect(() =>
      EncryptableRecord.requireOriginalColumnPresent({} as any, "name", ["id", "name"]),
    ).toThrow(/must create an additional column named 'original_name'/);
  });

  it("does not raise when the original_<name> column is present", () => {
    expect(() =>
      EncryptableRecord.requireOriginalColumnPresent({} as any, "name", [
        "id",
        "name",
        "original_name",
      ]),
    ).not.toThrow();
  });

  it("defers (no raise) when no columns are known (schema not loaded yet)", () => {
    expect(() =>
      EncryptableRecord.requireOriginalColumnPresent({} as any, "name", []),
    ).not.toThrow();
  });

  it("does not raise when supportUnencryptedData is true even if the column is missing", () => {
    Configurable.config.supportUnencryptedData = true;
    expect(() =>
      EncryptableRecord.requireOriginalColumnPresent({} as any, "name", ["id", "name"]),
    ).not.toThrow();
  });

  it("post-reflection re-check raises when a preserved attribute's original_<name> column is absent", () => {
    const modelClass = { _ignoreCasePreservedAttributes: new Set(["name"]) } as any;
    expect(() =>
      EncryptableRecord.requireOriginalColumnsAfterReflection(modelClass, ["id", "name"]),
    ).toThrow(/must create an additional column named 'original_name'/);
  });

  it("post-reflection re-check does not raise when the original_<name> column is present", () => {
    const modelClass = { _ignoreCasePreservedAttributes: new Set(["name"]) } as any;
    expect(() =>
      EncryptableRecord.requireOriginalColumnsAfterReflection(modelClass, [
        "id",
        "name",
        "original_name",
      ]),
    ).not.toThrow();
  });

  it("post-reflection re-check is a no-op when no ignoreCase attributes were preserved", () => {
    expect(() =>
      EncryptableRecord.requireOriginalColumnsAfterReflection({} as any, ["id", "name"]),
    ).not.toThrow();
  });

  it("post-reflection re-check defers when the reflected column set is empty (schema not loaded)", () => {
    const modelClass = { _ignoreCasePreservedAttributes: new Set(["name"]) } as any;
    expect(() =>
      EncryptableRecord.requireOriginalColumnsAfterReflection(modelClass, []),
    ).not.toThrow();
  });

  it("Base.encrypts ignoreCase raises ConfigurationError when original_<name> is missing", async () => {
    const adapter = await freshAdapter();
    const Model = class extends Base {
      static _tableName = "authors";
      static {
        this.adapter = adapter;
      }
    } as any;
    await Model.loadSchema();
    expect(() => {
      Model.encrypts("name", { deterministic: true, ignoreCase: true });
    }).toThrow(/must create an additional column named 'original_name'/);
  });

  it("Base.encrypts ignoreCase declared before the adapter connects raises after schema reflection", async () => {
    const adapter = await freshAdapter();
    Configurable.config.supportUnencryptedData = true;
    const Model = class extends Base {
      static _tableName = "authors";
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
        this.encrypts("name", { deterministic: true, ignoreCase: true });
      }
    } as any;
    Configurable.config.supportUnencryptedData = false;
    void Model.resetColumnInformation();
    await expect(async () => {
      await Model.loadSchema();
      new Model();
    }).rejects.toThrow(/must create an additional column named 'original_name'/);
  });

  it("Base.encrypts ignoreCase with a genuinely-disconnected adapter is fail-closed", async () => {
    const adapter = await freshAdapter();
    await expect(async () => {
      const Model = class extends Base {
        static _tableName = "authors";
        static {
          this.encrypts("name", { deterministic: true, ignoreCase: true });
          this.attribute("id", "integer");
          this.attribute("name", "string");
          this.adapter = adapter;
        }
      } as any;
      await Model.loadSchema();
      new Model();
    }).rejects.toThrow(/must create an additional column named 'original_name'/);
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
        this.adapter = adapter;
      }
    } as any;
    await Model.loadSchema();
    expect(() => new Model()).not.toThrow();
  });
});
