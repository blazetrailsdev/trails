import { describe, it, expect } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { captureSql, captureLogOutput } from "./sql-capture.js";

// Emit the three query shapes captureSql distinguishes: a normal load, a
// SCHEMA-tagged introspection query, and a cached statement.
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
    // Rails' capture_sql defaults to include_schema: false and returns
    // counter.log (test_case.rb:89), so SCHEMA introspection is dropped.
    // Cached statements are always excluded (SQLCounter parity).
    expect(await captureSql(emitTrio)).toEqual(["LOAD"]);
  });

  it("keeps SCHEMA queries when includeSchema is true", async () => {
    // Mirrors Rails' capture_sql(include_schema: true) -> counter.log_all.
    expect(await captureSql(emitTrio, { includeSchema: true })).toEqual(["LOAD", "INTROSPECT"]);
  });

  it("propagates errors raised inside the block", async () => {
    // Rails' capture_sql wraps a bare `yield` with no rescue, so a raising
    // block must not be masked by the SQL already captured before it unwound.
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
