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
  it("drops cached queries but keeps SCHEMA queries by default", async () => {
    // Cached statements are always excluded (Rails SQLCounter parity); SCHEMA
    // introspection is kept unless includeSchema is false.
    expect(await captureSql(emitTrio)).toEqual(["LOAD", "INTROSPECT"]);
  });

  it("drops SCHEMA and cached queries when includeSchema is false", async () => {
    // Mirrors Rails' capture_sql(include_schema: false).
    expect(await captureSql(emitTrio, { includeSchema: false })).toEqual(["LOAD"]);
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
