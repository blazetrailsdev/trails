import { describe, it, expect } from "vitest";
import { Mysql2Adapter } from "./mysql2-adapter.js";

// Trails-specific guards (no Rails counterpart): _buildInitSql() generates the
// per-connection bootstrap SQL. mysql2 uses `charset`; Rails' database.yml uses
// `encoding`. Both must produce a `SET NAMES ...` prefix, and a charset/collation
// carrying anything outside [A-Za-z0-9_] is rejected up front so it can never be
// interpolated into that SET NAMES clause. These run offline — constructing the
// adapter does not open a connection.
describe("Mysql2Adapter#_buildInitSql", () => {
  it("includes SET NAMES when charset is configured", async () => {
    const adapter = new Mysql2Adapter({ host: "localhost", charset: "utf8mb4" });
    const sql = (adapter as unknown as { _buildInitSql(): string })._buildInitSql();
    expect(sql).toMatch(/^SET NAMES utf8mb4,/);
    await adapter.close();
  });

  it("includes SET NAMES with COLLATE when both charset and collation are configured", async () => {
    const adapter = new Mysql2Adapter({
      host: "localhost",
      charset: "utf8mb4",
      collation: "utf8mb4_unicode_ci",
    } as never);
    const sql = (adapter as unknown as { _buildInitSql(): string })._buildInitSql();
    expect(sql).toMatch(/^SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci,/);
    await adapter.close();
  });

  it("includes SET NAMES when Rails-style encoding is configured", async () => {
    const adapter = new Mysql2Adapter({ host: "localhost", encoding: "utf8mb4" } as never);
    const sql = (adapter as unknown as { _buildInitSql(): string })._buildInitSql();
    expect(sql).toMatch(/^SET NAMES utf8mb4,/);
    await adapter.close();
  });

  it("omits SET NAMES when no charset is configured", async () => {
    const adapter = new Mysql2Adapter({ host: "localhost" });
    const sql = (adapter as unknown as { _buildInitSql(): string })._buildInitSql();
    expect(sql).not.toContain("NAMES");
    await adapter.close();
  });

  it("throws for invalid charset", () => {
    expect(
      () => new Mysql2Adapter({ host: "localhost", charset: "utf8'; DROP TABLE x; --" }),
    ).toThrow(/Invalid MySQL charset/);
  });
});
