import { TopLevel } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PG } from "../lib/index.js";
import type { Connection } from "../lib/connection.js";

const ENV = TopLevel.ENV!;
const connParams = {
  host: ENV["PGHOST"] ?? "localhost",
  port: ENV["PGPORT"] ?? "5432",
  user: ENV["PGUSER"],
  password: ENV["PGPASSWORD"],
  dbname: "activerecord_unittest",
};

describe("PG::Connection against a server", () => {
  let conn: Connection;

  beforeEach(async () => {
    conn = await PG.connect(connParams);
  });

  afterEach(async () => {
    if (!conn.isFinished()) await conn.finish();
  });

  it("type_map_for_results is TypeMapAllStrings until a map is assigned", async () => {
    expect(conn.typeMapForResults).toBeInstanceOf(PG.TypeMapAllStrings);
    expect((await conn.exec("SELECT 1, true")).values()).toEqual([["1", "t"]]);

    const map = new PG.TypeMapByOid();
    map.addCoder(new PG.TextDecoder.Integer(undefined, { name: "int4", oid: 23 }));
    conn.typeMapForResults = map;
    expect((await conn.exec("SELECT 1")).getvalue(0, 0)).toBe(1);
  });

  it("server_version is libpq's PQserverVersion of the startup server_version", async () => {
    const num = (await conn.exec("SHOW server_version_num")).getvalue(0, 0);
    expect(conn.serverVersion()).toBe(Number(num));
  });

  it("set_notice_receiver returns the previous receiver", async () => {
    const notices: (string | null)[] = [];
    const proc = (result: { errorField(field: number): string | null }): void => {
      notices.push(result.errorField(PG.PG_DIAG_MESSAGE_PRIMARY));
    };
    expect(conn.setNoticeReceiver(proc)).toBeNull();
    await conn.exec("DO $$ BEGIN RAISE NOTICE 'hello'; END $$");
    expect(notices).toEqual(["hello"]);
    expect(conn.setNoticeReceiver()).toBe(proc);
    await conn.exec("DO $$ BEGIN RAISE NOTICE 'again'; END $$");
    expect(notices).toEqual(["hello"]);
  });

  it("set_client_encoding changes client_encoding", async () => {
    await conn.setClientEncoding("SQL_ASCII");
    expect((await conn.exec("SHOW client_encoding")).getvalue(0, 0)).toBe("SQL_ASCII");
  });

  it("queries after pg_terminate_backend raise ConnectionBad, then no connection to the server", async () => {
    const pid = (await conn.exec("SELECT pg_backend_pid()")).getvalue(0, 0);
    const killer = await PG.connect(connParams);
    await killer.exec(`SELECT pg_terminate_backend(${String(pid)})`);
    await killer.finish();
    await new Promise((resolve) => setTimeout(resolve, 500));

    const first = await conn.exec("SELECT 1").catch((e: unknown) => e);
    expect(first).toBeInstanceOf(PG.ConnectionBad);
    expect((first as Error).message).toMatch(/\n$/);
    expect((first as Error).message).not.toMatch(/no connection to the server/i);
    expect(conn.status()).toBe(PG.CONNECTION_BAD);

    const second = await conn.exec("SELECT 1").catch((e: unknown) => e);
    expect(second).toBeInstanceOf(PG.ConnectionBad);
    expect((second as Error).message).toBe("no connection to the server\n");
    expect(conn.status()).toBe(PG.CONNECTION_BAD);
  });

  it("PG.connect yields the connection to its block and finishes it", async () => {
    let yielded: Connection | null = null;
    const value = await PG.connect(connParams, async (c) => {
      yielded = c;
      return (await c.exec("SELECT 'one'::text AS one")).getvalue(0, 0);
    });
    expect(value).toBe("one");
    expect(yielded!.isFinished()).toBe(true);
  });

  it("escape_identifier doubles quotes and wraps an empty string", () => {
    expect(conn.escapeIdentifier('a"b')).toBe('"a""b"');
    expect(conn.escapeIdentifier("")).toBe('""');
  });

  it("escape_identifier raises ArgumentError on a null byte", () => {
    expect(() => conn.escapeIdentifier("a\0b")).toThrow("string contains null byte");
  });

  it("escape_identifier raises PG::Error on an invalid multibyte character", () => {
    expect(() => conn.escapeIdentifier("a\uD800")).toThrow(PG.Error);
  });
});
