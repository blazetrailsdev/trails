/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/extension_migration_test.rb
 */
import { describe, it, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgresAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgresAdapter", () => {
  let adapter: PostgresAdapter;
  beforeEach(async () => {
    adapter = new PostgresAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgresqlExtensionMigrationTest", () => {
    it.skip("enable extension", async () => {});
    it.skip("disable extension", async () => {});
    it.skip("enable extension idempotent", async () => {});
    it.skip("disable extension idempotent", async () => {});
    it.skip("extension schema dump", async () => {});
    it.skip("enable extension migration ignores prefix and suffix", async () => {});
    it.skip("enable extension migration with schema", async () => {});
    it.skip("disable extension migration ignores prefix and suffix", async () => {});
    it.skip("disable extension raises when dependent objects exist", async () => {});
    it.skip("disable extension drops extension when cascading", async () => {});
  });
});
