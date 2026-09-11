import { describe, it, expect, vi } from "vitest";
import { AbstractMysqlAdapter } from "./abstract-mysql-adapter.js";
import { Mysql2Adapter } from "./mysql2-adapter.js";

async function configureSql(config: Record<string, unknown>): Promise<string> {
  const adapter = new Mysql2Adapter({ host: "localhost", ...config } as never);
  vi.spyOn(adapter, "checkVersion").mockResolvedValue(undefined as never);
  const rawExecute = vi.spyOn(adapter, "rawExecute").mockResolvedValue(undefined);
  await AbstractMysqlAdapter.prototype.configureConnection.call(adapter);
  await adapter.close();
  expect(rawExecute).toHaveBeenCalledTimes(1);
  expect(rawExecute.mock.calls[0][1]).toBe("SCHEMA");
  return rawExecute.mock.calls[0][0];
}

describe("AbstractMysqlAdapter#configureConnection", () => {
  it("includes SET NAMES when encoding is configured", async () => {
    expect(await configureSql({ encoding: "utf8mb4" })).toMatch(/^SET NAMES utf8mb4, /);
  });

  it("includes SET NAMES with COLLATE when both encoding and collation are configured", async () => {
    const sql = await configureSql({ encoding: "utf8mb4", collation: "utf8mb4_unicode_ci" });
    expect(sql).toMatch(/^SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci, /);
  });

  it("omits SET NAMES when no encoding is configured", async () => {
    expect(await configureSql({})).not.toContain("NAMES");
  });

  it("defaults to strict mode when no strict key is configured", async () => {
    expect(await configureSql({})).toContain(
      "@@SESSION.sql_mode = CONCAT(CONCAT(@@sql_mode, ',STRICT_ALL_TABLES'), ',NO_AUTO_VALUE_ON_ZERO'), ",
    );
  });

  it("honours a stored strict false", async () => {
    expect(await configureSql({ strict: false })).toContain(
      "REPLACE(@@sql_mode, 'STRICT_TRANS_TABLES', '')",
    );
  });

  it("leaves sql_mode alone when strict is :default", async () => {
    expect(await configureSql({ strict: ":default" })).not.toContain("sql_mode");
  });

  it("quotes a user-provided sql_mode variable instead of the strict arms", async () => {
    const sql = await configureSql({ variables: { sql_mode: "TRADITIONAL" } });
    expect(sql).toContain("@@SESSION.sql_mode = 'TRADITIONAL', ");
    expect(sql).not.toContain("STRICT_ALL_TABLES");
  });

  it("casts wait_timeout through typeCastConfigToInteger, defaulting to 2147483", async () => {
    expect(await configureSql({ waitTimeout: "30" })).toContain("@@SESSION.wait_timeout = 30");
    expect(await configureSql({})).toContain("@@SESSION.wait_timeout = 2147483");
  });

  it("sets :default variables to DEFAULT and skips nil ones", async () => {
    const sql = await configureSql({ variables: { sort_buffer_size: ":default", foo: null } });
    expect(sql).toContain("@@SESSION.sort_buffer_size = DEFAULT");
    expect(sql).not.toContain("foo");
  });

  it("throws for invalid charset", () => {
    expect(
      () => new Mysql2Adapter({ host: "localhost", charset: "utf8'; DROP TABLE x; --" }),
    ).toThrow(/Invalid MySQL charset/);
  });
});
