/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/serial_test.rb
 */
import { describe, it, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgresqlSerialTest", () => {
    it.skip("serial column", async () => {
      // Requires postgresql_serials fixture table
    });
    it.skip("not serial column", async () => {
      // Requires postgresql_serials fixture table
    });
    it.skip("schema dump with shorthand", async () => {
      // Requires postgresql_serials fixture table + schema dump helper
    });
    it.skip("schema dump with not serial", async () => {
      // Requires postgresql_serials fixture table + schema dump helper
    });
  });

  describe("PostgresqlBigSerialTest", () => {
    it.skip("bigserial column", async () => {
      // Requires postgresql_big_serials fixture table
    });
    it.skip("not bigserial column", async () => {
      // Requires postgresql_big_serials fixture table
    });
    it.skip("schema dump with shorthand", async () => {
      // Requires postgresql_big_serials fixture table + schema dump helper
    });
    it.skip("schema dump with not bigserial", async () => {
      // Requires postgresql_big_serials fixture table + schema dump helper
    });
  });

  describe("CollidedSequenceNameTest", () => {
    it.skip("serial columns", async () => {
      // Requires collided_sequence_name fixture table
    });
    it.skip("schema dump with collided sequence name", async () => {
      // Requires collided_sequence_name fixture table + schema dump helper
    });
  });

  describe("LongerSequenceNameDetectionTest", () => {
    it.skip("serial columns", async () => {
      // Requires longer_sequence_name fixture table
    });
    it.skip("schema dump with long table name", async () => {
      // Requires longer_sequence_name fixture table + schema dump helper
    });
  });
});
