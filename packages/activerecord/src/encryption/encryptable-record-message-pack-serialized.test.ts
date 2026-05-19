import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import {
  freshAdapter,
  configureEncryption,
  snapshotEncryptionConfig,
  restoreEncryptionConfig,
  makeEncryptedBookWithBinaryMessagePackSerialized,
  makeMsgPackTextBook,
  assertEncryptedAttribute,
} from "./test-helpers.js";
import type { TestDatabaseAdapter } from "../test-adapter.js";
import { withTransactionalFixtures } from "../test-helpers/with-transactional-fixtures.js";
import { Encoding as EncodingError } from "./errors.js";

describe("ActiveRecord::Encryption::EncryptableRecordMessagePackSerializedTest", () => {
  let adapter: TestDatabaseAdapter;
  let configSnapshot: ReturnType<typeof snapshotEncryptionConfig>;

  beforeAll(async () => {
    adapter = await freshAdapter();
  });

  withTransactionalFixtures(() => adapter);

  beforeEach(() => {
    configSnapshot = snapshotEncryptionConfig();
    configureEncryption();
  });

  afterEach(() => {
    restoreEncryptionConfig(configSnapshot);
  });

  it("binary data can be serialized with message pack", async () => {
    const Book = makeEncryptedBookWithBinaryMessagePackSerialized(adapter);
    const allBytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    const book = await Book.create({ logo: allBytes });
    await assertEncryptedAttribute(book, "logo", allBytes);
  });

  it("binary data can be encrypted uncompressed and serialized with message pack", async () => {
    const Book = makeEncryptedBookWithBinaryMessagePackSerialized(adapter);
    // Rails: both ranges are 128 bytes (< 140 threshold) so neither is compressed.
    // TS note: highBytes (128–255) encoded as Latin-1 measures as 256 UTF-8 bytes so
    // it may be compressed; the round-trip is correct either way.
    const lowBytes = Uint8Array.from({ length: 128 }, (_, i) => i);
    const highBytes = Uint8Array.from({ length: 128 }, (_, i) => i + 128);
    await assertEncryptedAttribute(await Book.create({ logo: lowBytes }), "logo", lowBytes);
    await assertEncryptedAttribute(await Book.create({ logo: highBytes }), "logo", highBytes);
  });

  it("text columns cannot be serialized with message pack", async () => {
    const MsgPackTextBook = makeMsgPackTextBook(adapter);
    await expect(MsgPackTextBook.create({ name: "Dune" })).rejects.toThrow(EncodingError);
  });
});
