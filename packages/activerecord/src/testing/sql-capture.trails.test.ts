import { describe, it, expect } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { captureSql, captureLogOutput } from "./sql-capture.js";

function emitTrio(): void {
  Notifications.instrument("sql.active_record", { sql: "LOAD", name: "User Load" }, () => {});
  Notifications.instrument("sql.active_record", { sql: "INTROSPECT", name: "SCHEMA" }, () => {});
  Notifications.instrument(
    "sql.active_record",
    { sql: "CACHED", name: "CACHE", cached: true },
    () => {},
  );
}

describe("captureSql", () => {
  it("drops cached and SCHEMA queries by default", async () => {
    expect(await captureSql(emitTrio)).toEqual(["LOAD"]);
  });

  it("keeps SCHEMA queries when includeSchema is true", async () => {
    expect(await captureSql(emitTrio, { includeSchema: true })).toEqual(["LOAD", "INTROSPECT"]);
  });

  it("propagates errors raised inside the block", async () => {
    await expect(
      captureSql(() => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});

describe("captureLogOutput", () => {
  it("accumulates the name + sql of each event, like Rails' StringIO logger", async () => {
    const output = await captureLogOutput(() => {
      Notifications.instrument(
        "sql.active_record",
        { sql: 'INSERT INTO "books"', name: "Book Bulk Insert" },
        () => {},
      );
    });
    expect(output).toContain("Book Bulk Insert");
    expect(output).toContain('INSERT INTO "books"');
  });
});
