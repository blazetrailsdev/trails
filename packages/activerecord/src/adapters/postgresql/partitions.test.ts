/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/partitions_test.rb
 */
import { describe, it, beforeEach, afterEach, expect } from "vitest";
import {
  describeIfPg,
  pgSupportsNativePartitioning,
  PostgreSQLAdapter,
  PG_TEST_URL,
} from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.dropTable("partitioned_events", { ifExists: true });
    await adapter.close();
  });

  describe("PostgresqlPartitionsTest", () => {
    it.skipIf(!pgSupportsNativePartitioning)("partitions table exists", async () => {
      await adapter.createTable(
        "partitioned_events",
        {
          force: true,
          id: false,
          options: "partition by range (issued_at)",
        },
        (t) => {
          t.column("issued_at", "timestamp");
        },
      );
      expect(await adapter.tableExists("partitioned_events")).toBe(true);
    });
  });
});
