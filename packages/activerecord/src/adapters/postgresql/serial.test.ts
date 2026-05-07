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
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in serial
      // ROOT-CAUSE: adapters/postgresql/serial.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/serial.ts; affects ~10–47 tests in serial.test.ts
      // Requires postgresql_serials fixture table
    });
    it.skip("not serial column", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in serial
      // ROOT-CAUSE: adapters/postgresql/serial.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/serial.ts; affects ~10–47 tests in serial.test.ts
      // Requires postgresql_serials fixture table
    });
    it.skip("schema dump with shorthand", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in serial
      // ROOT-CAUSE: adapters/postgresql/serial.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/serial.ts; affects ~10–47 tests in serial.test.ts
      // Requires postgresql_serials fixture table + schema dump helper
    });
    it.skip("schema dump with not serial", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in serial
      // ROOT-CAUSE: adapters/postgresql/serial.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/serial.ts; affects ~10–47 tests in serial.test.ts
      // Requires postgresql_serials fixture table + schema dump helper
    });
  });

  describe("PostgresqlBigSerialTest", () => {
    it.skip("bigserial column", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in serial
      // ROOT-CAUSE: adapters/postgresql/serial.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/serial.ts; affects ~10–47 tests in serial.test.ts
      // Requires postgresql_big_serials fixture table
    });
    it.skip("not bigserial column", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in serial
      // ROOT-CAUSE: adapters/postgresql/serial.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/serial.ts; affects ~10–47 tests in serial.test.ts
      // Requires postgresql_big_serials fixture table
    });
    it.skip("schema dump with shorthand", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in serial
      // ROOT-CAUSE: adapters/postgresql/serial.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/serial.ts; affects ~10–47 tests in serial.test.ts
      // Requires postgresql_big_serials fixture table + schema dump helper
    });
    it.skip("schema dump with not bigserial", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in serial
      // ROOT-CAUSE: adapters/postgresql/serial.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/serial.ts; affects ~10–47 tests in serial.test.ts
      // Requires postgresql_big_serials fixture table + schema dump helper
    });
  });

  describe("CollidedSequenceNameTest", () => {
    it.skip("serial columns", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in serial
      // ROOT-CAUSE: adapters/postgresql/serial.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/serial.ts; affects ~10–47 tests in serial.test.ts
      // Requires collided_sequence_name fixture table
    });
    it.skip("schema dump with collided sequence name", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in serial
      // ROOT-CAUSE: adapters/postgresql/serial.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/serial.ts; affects ~10–47 tests in serial.test.ts
      // Requires collided_sequence_name fixture table + schema dump helper
    });
  });

  describe("LongerSequenceNameDetectionTest", () => {
    it.skip("serial columns", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in serial
      // ROOT-CAUSE: adapters/postgresql/serial.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/serial.ts; affects ~10–47 tests in serial.test.ts
      // Requires longer_sequence_name fixture table
    });
    it.skip("schema dump with long table name", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in serial
      // ROOT-CAUSE: adapters/postgresql/serial.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/serial.ts; affects ~10–47 tests in serial.test.ts
      // Requires longer_sequence_name fixture table + schema dump helper
    });
  });
});
