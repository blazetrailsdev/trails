/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/postgresql_adapter_prevent_writes_test.rb
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

  describe("PostgreSQLAdapterPreventWritesTest", () => {
    it.skip("prevent writes insert", async () => {});
    it.skip("prevent writes update", async () => {});
    it.skip("prevent writes delete", async () => {});
    it.skip("prevent writes create table", async () => {});
    it.skip("prevent writes drop table", async () => {});
    it.skip("prevent writes allows select", async () => {});
    it.skip("prevent writes allows explain", async () => {});
    it.skip("prevent writes toggle", async () => {});
    it.skip("doesnt error when a read query with cursors is called while preventing writes", async () => {});
    it.skip("errors when an insert query is called while preventing writes", () => {});
    it.skip("errors when an update query is called while preventing writes", () => {});
    it.skip("errors when a delete query is called while preventing writes", () => {});
    it.skip("doesnt error when a select query is called while preventing writes", () => {});
    it.skip("doesnt error when a show query is called while preventing writes", () => {});
    it.skip("doesnt error when a set query is called while preventing writes", () => {});
    it.skip("doesnt error when a read query with leading chars is called while preventing writes", () => {});
  });
});
