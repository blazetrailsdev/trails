import { it, expect, describe, vi } from "vitest";
import { Temporal, Time } from "@blazetrails/date";
import { Mysql2, mysql2Client } from "./client.js";

describe("mysql2Client", () => {
  it("automatic_close = false unrefs and strips listeners, and never closes the socket", () => {
    const stream = { unref: vi.fn(), removeAllListeners: vi.fn(), end: vi.fn(), destroy: vi.fn() };
    const client = mysql2Client({ connection: { stream } });
    expect(client.automaticClose).toBe(true);
    client.automaticClose = false;
    expect(client.automaticClose).toBe(false);
    expect(stream.removeAllListeners).toHaveBeenCalledOnce();
    expect(stream.unref).toHaveBeenCalledOnce();
    expect(stream.end).not.toHaveBeenCalled();
    expect(stream.destroy).not.toHaveBeenCalled();
  });

  it("automatic_close = true leaves the socket alone", () => {
    const stream = { unref: vi.fn(), removeAllListeners: vi.fn() };
    const client = mysql2Client({ connection: { stream } });
    client.automaticClose = true;
    expect(stream.unref).not.toHaveBeenCalled();
  });

  it("answers for a client with no socket", () => {
    const client = mysql2Client({});
    expect(() => (client.automaticClose = false)).not.toThrow();
  });

  it("execute unboxes a Float carrier and formats temporals, and leaves the rest alone", async () => {
    const execute = vi.fn(async () => []);
    const client = mysql2Client({ execute });
    const binds = [
      new Number(3),
      Time.utc(2020, 1, 2, 3, 4, 5, 6),
      Temporal.PlainDate.from("2020-01-02"),
      "a",
      1n,
      null,
    ];
    await (
      client as unknown as { execute(sql: string, values: unknown[]): Promise<unknown> }
    ).execute("SELECT ?", binds);
    expect(execute).toHaveBeenCalledWith("SELECT ?", [
      3,
      "2020-01-02 03:04:05.000006",
      "2020-01-02",
      "a",
      1n,
      null,
    ]);
    expect(mysql2Client(client).execute).toBe(client.execute);
  });

  it("Mysql2.Error is an error the client raised, not any error with a code", async () => {
    const raised = Object.assign(new Error("gone"), { code: "ER_X" });
    const client = mysql2Client({ query: () => Promise.reject(raised) });
    await client.query("").catch(() => {});
    expect(raised instanceof Mysql2.Error).toBe(true);
    expect(Object.assign(new Error(), { code: "ENOENT" }) instanceof Mysql2.Error).toBe(false);
  });
});

describe("Mysql2::Client#warning_count", () => {
  it("is the count the last EOF or OK packet carried", async () => {
    const handlePacket = vi.fn();
    const query = vi.fn(async () => [{ affectedRows: 1, warningStatus: 2 }, undefined]);
    const client = mysql2Client({ connection: { handlePacket }, query });
    expect(client.warningCount).toBe(0);

    const eof = Buffer.from([0xfe, 3, 0, 2, 0]);
    const packet = {
      offset: 0,
      end: eof.length,
      isEOF: () => true,
      eofWarningCount: () => eof.readInt16LE(1),
    };
    (
      client as unknown as { connection: { handlePacket(p: object): void } }
    ).connection.handlePacket(packet);
    expect(handlePacket).toHaveBeenCalledWith(packet);
    expect(client.warningCount).toBe(3);

    await client.query("UPDATE t SET a = 1");
    expect(client.warningCount).toBe(2);
  });

  it("query merges its options over query_options, and _query casts with what it is handed", async () => {
    const native = vi.fn(async (_options: object) => [[], [{ name: "a" }]]);
    const client = mysql2Client({ query: native });
    await client.query("SELECT 1", { databaseTimezone: "utc" });
    expect(client.queryOptions.databaseTimezone).toBe("local");
    const { typeCast } = native.mock.calls[0][0] as {
      typeCast(field: object, next: () => unknown): Time;
    };
    const time = typeCast({ type: "DATETIME", string: () => "2026-04-27 14:23:55" }, () => null);
    expect(time.getutc().hour).toBe(14);
  });

  type Cast = { typeCast(field: object, next: () => unknown): unknown };
  const castOf = (native: { mock: { calls: object[][] } }, call = 0): Cast["typeCast"] =>
    (native.mock.calls[call][0] as Cast).typeCast;

  it("_query answers a hash row keyed by field name, symbolize_keys or not", async () => {
    const native = vi.fn(async (_options: object) => [[{ a: 1 }], [{ name: "a" }]]);
    const client = mysql2Client({ query: native });
    for (const symbolizeKeys of [false, true]) {
      const result = (await client.query("SELECT 1 AS a", { symbolizeKeys }))!;
      expect(result.fields).toEqual(["a"]);
      expect(result.toA()).toEqual([{ a: 1 }]);
    }
    expect(native.mock.calls[0][0]).toMatchObject({ rowsAsArray: false });
  });

  it("_query answers the raw string for every field when cast is false", async () => {
    const native = vi.fn(async (_options: object) => [[], [{ name: "a" }]]);
    const client = mysql2Client({ query: native });
    await client.query("SELECT 1", { cast: false });
    const next = vi.fn(() => 1);
    const field = { type: "LONGLONG", string: () => "1" };
    expect(castOf(native)(field, next)).toBe("1");
    expect(castOf(native)({ type: "DATETIME", string: () => null }, next)).toBeNull();
    expect(next).not.toHaveBeenCalled();
  });

  it("_query casts a TINYINT(1) and a BIT(1) to a boolean only under cast_booleans", async () => {
    const native = vi.fn(async (_options: object) => [[], [{ name: "a" }]]);
    const client = mysql2Client({ query: native });
    await client.query("SELECT 1");
    await client.query("SELECT 1", { castBooleans: true });
    const tiny = (value: string | null, length = 1) => ({
      type: "TINY",
      length,
      string: () => value,
    });
    const bit = (value: number, length = 1) => ({
      type: "BIT",
      length,
      string: () => null,
      buffer: () => Uint8Array.of(value),
    });
    const next = () => "next";
    expect(castOf(native, 0)(tiny("1"), () => 1)).toBe(1);
    expect(castOf(native, 0)(bit(1), next)).toBe("next");
    expect(castOf(native, 1)(tiny("1"), next)).toBe(true);
    expect(castOf(native, 1)(tiny("0"), next)).toBe(false);
    expect(castOf(native, 1)(tiny(null), next)).toBeNull();
    expect(castOf(native, 1)(tiny("1", 4), () => 1)).toBe(1);
    expect(castOf(native, 1)(bit(1), next)).toBe(true);
    expect(castOf(native, 1)(bit(0), next)).toBe(false);
    expect(castOf(native, 1)(bit(1, 8), next)).toBe("next");
  });

  it("_query converts a time to application_timezone when one is named", async () => {
    const native = vi.fn(async (_options: object) => [[], [{ name: "a" }]]);
    const client = mysql2Client({ query: native });
    const field = { type: "DATETIME", string: () => "2026-04-27 14:23:55" };
    await client.query("SELECT 1", { databaseTimezone: "utc" });
    await client.query("SELECT 1", { databaseTimezone: "utc", applicationTimezone: "local" });
    await client.query("SELECT 1", { databaseTimezone: "local", applicationTimezone: "utc" });
    const [unnamed, local, utc] = [0, 1, 2].map((call) => castOf(native, call)(field, () => null));
    expect((unnamed as Time).isUtc()).toBe(true);
    expect((local as Time).isUtc()).toBe(false);
    expect((local as Time).getutc().hour).toBe(14);
    expect((utc as Time).isUtc()).toBe(true);
    expect((utc as Time).getlocal().hour).toBe(14);
  });

  it("Statement#execute merges its keywords over query_options, and always casts", async () => {
    const execute = vi.fn(async (_options: object, _values: unknown[]) => [[[1]], [{ name: "a" }]]);
    const client = mysql2Client({ execute });
    const stmt = client.prepare("SELECT ?");
    await stmt.execute(1);
    await stmt.execute(1, "x", { as: "array", cast: false, databaseTimezone: "utc" });
    expect(execute.mock.calls.map(([options, values]) => [options, values])).toMatchObject([
      [{ sql: "SELECT ?", rowsAsArray: false }, [1]],
      [{ sql: "SELECT ?", rowsAsArray: true }, [1, "x"]],
    ]);
    const time = castOf(execute, 1)(
      { type: "DATETIME", string: () => "2026-04-27 14:23:55" },
      () => null,
    ) as Time;
    expect(time.isUtc()).toBe(true);
    expect(client.queryOptions).toEqual(Mysql2.Client.defaultQueryOptions());

    await stmt.execute(1, Temporal.PlainDate.from("2020-01-02"));
    expect(execute.mock.calls[2]).toMatchObject([{ rowsAsArray: false }, [1, "2020-01-02"]]);
  });

  it("default_query_options is one shared Hash each client dups", () => {
    expect(Mysql2.Client.defaultQueryOptions()).toBe(Mysql2.Client.defaultQueryOptions());
    const { queryOptions } = mysql2Client({});
    expect(queryOptions).toEqual(Mysql2.Client.defaultQueryOptions());
    expect(queryOptions).not.toBe(Mysql2.Client.defaultQueryOptions());
  });
});
