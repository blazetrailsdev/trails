import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import {
  configureEncryption,
  snapshotEncryptionConfig,
  restoreEncryptionConfig,
  makeEncryptedBook,
  installEncryptionSchema,
} from "./test-helpers.js";
import { createPooledTestAdapter, type SidecarAdapter } from "../test-adapter.js";
import { withTransactionalFixtures } from "../test-helpers/with-transactional-fixtures.js";

describe("ActiveRecord::Encryption::ConcurrencyTest", () => {
  let adapter: SidecarAdapter;
  let configSnapshot: ReturnType<typeof snapshotEncryptionConfig>;

  beforeAll(async () => {
    const pooled = await createPooledTestAdapter();
    adapter = pooled.adapter;
    await installEncryptionSchema(adapter);
  });

  withTransactionalFixtures(() => adapter);

  beforeEach(() => {
    configSnapshot = snapshotEncryptionConfig();
    configureEncryption();
  });

  afterEach(() => {
    restoreEncryptionConfig(configSnapshot);
  });

  it("models can be encrypted and decrypted in different threads concurrently", async () => {
    const Book = makeEncryptedBook(adapter);
    new Book();

    const names = Array.from({ length: 10 }, (_, i) => `Concurrent Book ${i}`);
    const created = await Promise.all(names.map((name) => Book.create({ name })));
    const reloaded = await Promise.all(created.map((b: any) => Book.find(b.id)));

    for (let i = 0; i < names.length; i++) {
      expect((reloaded[i] as any).name).toBe(names[i]);
    }
  });
});
