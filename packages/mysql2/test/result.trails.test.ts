import { describe, expect, it } from "vitest";
import type { Time } from "@blazetrails/date";
import type { Mysql2StreamResult } from "../lib/index.js";
import { specHelper } from "./spec-helper.js";

describe("Mysql2::Result (trails)", () => {
  const state = specHelper();

  it("casts a prepared DATETIME(3)'s fraction as microseconds", async () => {
    const stmt = await state.client.prepare(
      "SELECT CAST('2010-04-04 11:44:00.123' AS DATETIME(3)) AS dt, CAST('11:44:00.5' AS TIME(1)) AS t",
    );
    const row = (await stmt.execute())!.toA()[0] as { dt: Time; t: Time };
    expect(row.dt.usec).toBe(123000);
    expect(row.t.usec).toBe(500000);
  });

  it("free drains an unfinished stream so the client can query again", async () => {
    const result = (await state.client.query("SELECT 1 UNION SELECT 2", {
      stream: true,
      cacheRows: false,
    })) as Mysql2StreamResult;
    await result.first();
    await result.free();
    expect((await state.client.query("SELECT 3 AS n"))!.toA()).toEqual([{ n: 3 }]);
  });

  it("a streamed non-SELECT answers nil and records affected rows", async () => {
    await state.client.query("CREATE TEMPORARY TABLE streamed_write (id INT)");
    expect(
      await state.client.query("INSERT INTO streamed_write VALUES (1), (2)", { stream: true }),
    ).toBeNull();
    expect(state.client.affectedRows).toBe(2);
  });
});
