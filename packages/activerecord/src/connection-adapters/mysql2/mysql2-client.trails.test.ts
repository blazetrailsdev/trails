import { it, expect, describe, vi } from "vitest";
import { Temporal, Time } from "@blazetrails/date";
import { Mysql2, mysql2Client } from "./mysql2-client.js";

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
