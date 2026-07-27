import { describe, expect, test } from "vitest";
import "../sqlite/better-sqlite3.js";
import { BetterSQLite3Adapter } from "../connection-adapters/better-sqlite3-adapter.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import { loadSchema } from "./load-schema-helper.js";

describe("LoadSchemaHelper", () => {
  test("load_schema", async () => {
    const adapter = new BetterSQLite3Adapter(":memory:") as unknown as AbstractAdapter;
    try {
      await loadSchema(adapter);

      const res = await adapter.selectAll(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      );
      const tables = res.toArray().map((r) => r.name as string);

      expect(tables.length).toBeGreaterThan(300);
      expect(tables).toContain("topics");
      expect(tables).toContain("posts");
    } finally {
      await (adapter as unknown as BetterSQLite3Adapter).close();
    }
  });
});
