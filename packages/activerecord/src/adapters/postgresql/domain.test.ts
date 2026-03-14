/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/domain_test.rb
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

  describe("PostgresqlDomainTest", () => {
    it.skip("column", async () => {});
    it.skip("domain type", async () => {});
    it.skip("domain acts like basetype", async () => {});
  });
});
