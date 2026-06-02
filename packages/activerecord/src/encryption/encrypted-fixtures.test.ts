// activerecord/test/cases/encryption/encrypted_fixtures_test.rb
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Base } from "../base.js";
import "../relation.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";
import { useFixtures } from "../test-helpers/use-fixtures.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { TEST_SCHEMA } from "../test-helpers/test-schema.js";

describe("ActiveRecord::Encryption::EncryptableFixtureTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();

  let restoreEncryption: (() => void) | undefined;
  beforeAll(async () => {
    const { configureEncryption, snapshotEncryptionConfig, restoreEncryptionConfig } =
      await import("./test-helpers.js");
    const snapshot = snapshotEncryptionConfig();
    configureEncryption();
    restoreEncryption = () => restoreEncryptionConfig(snapshot);
    await defineSchema(TEST_SCHEMA);
  });
  afterAll(() => {
    restoreEncryption?.();
  });

  const { encryptedBooks } = useFixtures(["encryptedBooks"], () => Base.adapter, {
    schema: TEST_SCHEMA,
  });

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
  setupHandlerSuite();
  useHandlerTransactionalFixtures();

  let restoreEncryption: (() => void) | undefined;
  beforeAll(async () => {
    const { configureEncryption, snapshotEncryptionConfig, restoreEncryptionConfig } =
      await import("./test-helpers.js");
    const snapshot = snapshotEncryptionConfig();
    configureEncryption();
    restoreEncryption = () => restoreEncryptionConfig(snapshot);
    await defineSchema(TEST_SCHEMA);
  });
  afterAll(() => {
    restoreEncryption?.();
  });

  const { encryptedBookThatIgnoresCases } = useFixtures(
    ["encryptedBookThatIgnoresCases"],
    () => Base.adapter,
    { schema: TEST_SCHEMA },
  );

  it("preserved columns due to ignore_case: true gets encrypted automatically", async () => {
    const book = encryptedBookThatIgnoresCases("rfr");
    expect((book as any).name).toBe("Ruby for Rails");
    const { EncryptableRecord } = await import("./encryptable-record.js");
    expect(EncryptableRecord.isEncryptedAttribute(book, "name")).toBe(true);
  });
});
