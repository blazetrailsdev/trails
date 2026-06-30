// activerecord/test/cases/encryption/encrypted_fixtures_test.rb
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import "../relation.js";
import { fixtures } from "../test-helpers/fixtures.js";

describe("ActiveRecord::Encryption::EncryptableFixtureTest", () => {
  let restoreEncryption: (() => void) | undefined;
  beforeAll(async () => {
    const { configureEncryption, snapshotEncryptionConfig, restoreEncryptionConfig } =
      await import("./test-helpers.js");
    const snapshot = snapshotEncryptionConfig();
    configureEncryption();
    restoreEncryption = () => restoreEncryptionConfig(snapshot);
  });
  afterAll(() => {
    restoreEncryption?.();
  });

  const { encryptedBooks } = fixtures(["encryptedBooks"]);

  it("fixtures get encrypted automatically", async () => {
    const { EncryptableRecord } = await import("./encryptable-record.js");
    expect(EncryptableRecord.isEncryptedAttribute(encryptedBooks("awdr"), "name")).toBe(true);
  });
});

// encryptedBookThatIgnoresCases and encryptedBooks both map to the same table;
// loading both under one handler would have the second seeder wipe the first
// set. A second EncryptableFixtureTest describe (its own handler suite) isolates
// the seeders while keeping the Rails-matching describe path flat.
describe("ActiveRecord::Encryption::EncryptableFixtureTest", () => {
  let restoreEncryption: (() => void) | undefined;
  beforeAll(async () => {
    const { configureEncryption, snapshotEncryptionConfig, restoreEncryptionConfig } =
      await import("./test-helpers.js");
    const snapshot = snapshotEncryptionConfig();
    configureEncryption();
    restoreEncryption = () => restoreEncryptionConfig(snapshot);
  });
  afterAll(() => {
    restoreEncryption?.();
  });

  const { encryptedBookThatIgnoresCases } = fixtures(["encryptedBookThatIgnoresCases"]);

  it("preserved columns due to ignore_case: true gets encrypted automatically", async () => {
    const book = encryptedBookThatIgnoresCases("rfr");
    expect((book as any).name).toBe("Ruby for Rails");
    const { EncryptableRecord } = await import("./encryptable-record.js");
    expect(EncryptableRecord.isEncryptedAttribute(book, "name")).toBe(true);
  });
});
