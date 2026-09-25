import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { assertNothingRaised } from "@blazetrails/activesupport";
import {
  freshAdapter,
  configureEncryption,
  snapshotEncryptionConfig,
  restoreEncryptionConfig,
  makeEncryptedPost,
  makeEncryptedBook,
  createUnencryptedBookIgnoringCase,
  makeEncryptedBookThatIgnoresCase,
  makePlainPost,
  makeEncryptedAuthorWithPreviousSchemes,
  makeKeyProvider,
  assertEncryptedAttribute,
  assertNotEncryptedAttribute,
  assertCiphertextDecryptsTo,
  Encryption,
} from "./test-helpers.js";
import { Scheme } from "./scheme.js";
import { Configurable } from "./configurable.js";
import { fixtures } from "../test-fixtures.js";

describe("ActiveRecord::Encryption::EncryptableRecordApiTest", () => {
  let configSnapshot: ReturnType<typeof snapshotEncryptionConfig>;

  let txnAdapter: Awaited<ReturnType<typeof freshAdapter>>;
  beforeAll(async () => {
    txnAdapter = await freshAdapter();
  });
  fixtures([]);

  beforeEach(() => {
    configSnapshot = snapshotEncryptionConfig();
    Configurable.config.previousSchemes = [];
    configureEncryption();
    Configurable.config.supportUnencryptedData = true;
  });

  afterEach(() => {
    restoreEncryptionConfig(configSnapshot);
  });

  it("encrypt encrypts all the encryptable attributes", async () => {
    await freshAdapter();
    const Post = makeEncryptedPost();
    const title = "The Starfleet is here!";
    const body = "<p>the Starfleet is here, we are safe now!</p>";

    const post = await Encryption.withoutEncryption(() => Post.create({ title, body }));
    await post.encrypt();

    await assertEncryptedAttribute(post, "title", title);
    await assertEncryptedAttribute(post, "body", body);
  });

  it("encrypt won't fail for classes without attributes to encrypt", async () => {
    await freshAdapter();
    const PlainPost = makePlainPost();
    const post = await PlainPost.create({ title: "hello", body: "world" });
    await assertNothingRaised(() => post.encrypt());
  });

  it("decrypt decrypts encrypted attributes", async () => {
    await freshAdapter();
    const Post = makeEncryptedPost();
    const title = "the Starfleet is here!";
    const body = "<p>the Starfleet is here, we are safe now!</p>";
    const post = await Post.create({ title, body });
    await assertEncryptedAttribute(post, "title", title);
    await assertEncryptedAttribute(post, "body", body);

    await post.decrypt();

    assertNotEncryptedAttribute(await post.reload(), "title", title);
    assertNotEncryptedAttribute(post, "body", body);
  });

  it("decrypt can be invoked multiple times", async () => {
    await freshAdapter();
    const Post = makeEncryptedPost();
    const post = await Post.create({
      title: "the Starfleet is here",
      body: "<p>the Starfleet is here, we are safe now!</p>",
    });

    for (let i = 0; i < 3; i++) await post.decrypt();

    assertNotEncryptedAttribute(await post.reload(), "title", "the Starfleet is here");
    assertNotEncryptedAttribute(post, "body", "<p>the Starfleet is here, we are safe now!</p>");
  });

  it("encrypt can be invoked multiple times", async () => {
    await freshAdapter();
    const Post = makeEncryptedPost();
    const post = await Post.create({
      title: "the Starfleet is here",
      body: "<p>the Starfleet is here, we are safe now!</p>",
    });

    for (let i = 0; i < 3; i++) await post.encrypt();

    await assertEncryptedAttribute(await post.reload(), "title", "the Starfleet is here");
    await assertEncryptedAttribute(post, "body", "<p>the Starfleet is here, we are safe now!</p>");
  });

  it("encrypted_attribute? returns false for regular attributes", async () => {
    await freshAdapter();
    const Book = makeEncryptedBook();
    const book = await Book.create({ name: "Dune" });
    expect(book.isEncryptedAttribute("id")).toBeFalsy();
  });

  it("encrypted_attribute? returns true for encrypted attributes which content is encrypted", async () => {
    await freshAdapter();
    const Book = makeEncryptedBook();
    const book = await Book.create({ name: "Dune" });
    const reloaded = await Book.find(book.id);
    expect(reloaded.isEncryptedAttribute("name")).toBeTruthy();
  });

  it("encrypted_attribute? returns false for encrypted attributes which content is not encrypted", async () => {
    await freshAdapter();
    const Book = makeEncryptedBook();
    const book = await Encryption.withoutEncryption(() => Book.create({ name: "Dune" }));
    expect(book.isEncryptedAttribute("name")).toBeFalsy();
  });

  it("ciphertext_for returns the ciphertext for a given attribute", async () => {
    await freshAdapter();
    const Book = makeEncryptedBook();
    const book = await Book.create({ name: "Dune" });
    assertCiphertextDecryptsTo(book, "name", book.ciphertextFor("name"));
  });

  it("ciphertext_for returns the persisted ciphertext for a non-deterministically encrypted attribute", async () => {
    await freshAdapter();
    const Post = makeEncryptedPost();
    const post = await Post.create({
      title: "Fear is the mind-killer",
      body: "Fear is the little-death...",
    });
    expect(post.readAttributeBeforeTypeCast("title")).toBe(post.ciphertextFor("title"));
    assertCiphertextDecryptsTo(post, "title", post.ciphertextFor("title"));
  });

  it("ciphertext_for returns the ciphertext of a new value", async () => {
    await freshAdapter();
    const Book = makeEncryptedBook();
    const book = await Book.create({ name: "Dune" });
    book.name = "Arrakis";

    assertCiphertextDecryptsTo(book, "name", book.ciphertextFor("name"));
  });

  it("ciphertext_for returns the ciphertext of a decrypted value", async () => {
    await freshAdapter();
    const Book = makeEncryptedBook();
    const book = await Book.create({ name: "Dune" });
    await book.decrypt();

    assertCiphertextDecryptsTo(book, "name", book.ciphertextFor("name"));
  });

  it("ciphertext_for returns the ciphertext of a value when the record is new", async () => {
    await freshAdapter();
    const Book = makeEncryptedBook();
    const book = new Book();
    book.name = "Dune";

    assertCiphertextDecryptsTo(book, "name", book.ciphertextFor("name"));
  });

  it("encrypt attributes encrypted with a previous encryption scheme", async () => {
    const prevKeyProvider = makeKeyProvider("prev-key-for-encryption-test-32b!!");
    const prevScheme = new Scheme({ keyProvider: prevKeyProvider });

    await freshAdapter();
    const Author = makeEncryptedAuthorWithPreviousSchemes([prevScheme]);

    const author = await Author.create({ name: "david" });

    const oldType = Author.typeForAttribute("name").previousTypes[0];
    const valueEncryptedWithOldType = oldType.serialize("dhh") as string;
    await Encryption.withoutEncryption(() =>
      author.updateColumns({ name: valueEncryptedWithOldType }),
    );

    await (await author.reload()).encrypt();
    expect((await author.reload()).name).toBe("dhh");
  });

  it("encrypt won't change the encoding of strings even when compression is used", async () => {
    await freshAdapter();
    const Post = makeEncryptedPost();
    const title = `The Starfleet is here! ${"OMG👌".repeat(30)}`;
    const post = await Encryption.withoutEncryption(() =>
      Post.create({ title, body: "some body" }),
    );
    await post.encrypt();
    const reloaded = await Post.find(post.id);
    expect(reloaded.title).toBe(title);
  });

  it("encrypt will honor forced encoding for deterministic attributes", async () => {
    Configurable.config.forcedEncodingForDeterministicEncryption = "UTF-8";
    await freshAdapter();
    const Book = makeEncryptedBook();
    new Book();
    const book = await Encryption.withoutEncryption(() => Book.create({ name: "Dune" }));
    await book.encrypt();
    expect((await book.reload()).name).toBe("Dune");
  });

  it("encrypt won't force encoding for deterministic attributes when option is nil", async () => {
    Configurable.config.forcedEncodingForDeterministicEncryption = "";
    await freshAdapter();
    const Book = makeEncryptedBook();
    new Book();
    const book = await Encryption.withoutEncryption(() => Book.create({ name: "Dune" }));
    await book.encrypt();
    expect((await book.reload()).name).toBe("Dune");
  });

  it("encrypt will preserve case when :ignore_case option is used", async () => {
    Configurable.config.supportUnencryptedData = true;
    await freshAdapter();
    const Book = makeEncryptedBookThatIgnoresCase();
    new Book();
    const book = await createUnencryptedBookIgnoringCase(Book, { name: "Dune" });
    expect(await Encryption.withoutEncryption(async () => (await book.reload()).name)).toBe("Dune");
    expect(book.name).toBe("Dune");
    await book.encrypt();
    expect((await book.reload()).name).toBe("Dune");
  });

  it("re-encrypting will preserve case when :ignore_case option is used", async () => {
    Configurable.config.supportUnencryptedData = true;
    await freshAdapter();
    const Book = makeEncryptedBookThatIgnoresCase();
    new Book();
    const book = await createUnencryptedBookIgnoringCase(Book, { name: "Dune" });
    expect(await Encryption.withoutEncryption(async () => (await book.reload()).name)).toBe("Dune");
    expect(book.name).toBe("Dune");
    await book.encrypt();
    await book.encrypt();
    expect((await book.reload()).name).toBe("Dune");
  });
});
