import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import {
  freshAdapter,
  configureEncryption,
  snapshotEncryptionConfig,
  restoreEncryptionConfig,
  makeEncryptedBook,
} from "./test-helpers.js";
import type { TestDatabaseAdapter } from "../test-adapter.js";
import { withTransactionalFixtures } from "../test-fixtures/with-transactional-fixtures.js";

describe("ActiveRecord::Encryption::ConcurrencyTest", () => {
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

  it.skip("models can be encrypted and decrypted in different threads concurrently", async () => {
    const Book = makeEncryptedBook(adapter);
    new Book();

    const names = Array.from({ length: 10 }, (_, i) => `Concurrent Book ${i}`);
    const created = await Promise.all(names.map((name) => Book.create({ name })));
    const reloaded = await Promise.all(created.map((b: any) => Book.find(b.id)));

    for (let i = 0; i < names.length; i++) {
      expect(reloaded[i].name).toBe(names[i]);
    }
  });
});
