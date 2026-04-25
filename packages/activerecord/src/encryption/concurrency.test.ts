import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  freshAdapter,
  configureEncryption,
  snapshotEncryptionConfig,
  restoreEncryptionConfig,
  makeEncryptedBook,
} from "./test-helpers.js";

describe("ActiveRecord::Encryption::ConcurrencyTest", () => {
  let configSnapshot: ReturnType<typeof snapshotEncryptionConfig>;

  beforeEach(() => {
    configSnapshot = snapshotEncryptionConfig();
    configureEncryption();
  });

  afterEach(() => {
    restoreEncryptionConfig(configSnapshot);
  });

  it("models can be encrypted and decrypted in different threads concurrently", async () => {
    // JS is single-threaded; this exercises concurrent async encrypt/decrypt operations
    // (multiple Promises in flight) to verify no shared-state corruption occurs.
    const Book = makeEncryptedBook(freshAdapter());
    new Book();

    const names = Array.from({ length: 10 }, (_, i) => `Concurrent Book ${i}`);
    const created = await Promise.all(names.map((name) => Book.create({ name })));
    const reloaded = await Promise.all(created.map((b: any) => Book.find(b.id)));

    for (let i = 0; i < names.length; i++) {
      expect((reloaded[i] as any).name).toBe(names[i]);
    }
  });
});
