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

  it("default_query_options is one shared Hash each client dups", () => {
    expect(Mysql2.Client.defaultQueryOptions()).toBe(Mysql2.Client.defaultQueryOptions());
    const { queryOptions } = mysql2Client({});
    expect(queryOptions).toEqual(Mysql2.Client.defaultQueryOptions());
    expect(queryOptions).not.toBe(Mysql2.Client.defaultQueryOptions());
  });
});
