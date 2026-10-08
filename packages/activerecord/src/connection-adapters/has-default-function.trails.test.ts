import { describe, it, expect } from "vitest";
import { PostgreSQLAdapter } from "./postgresql-adapter.js";
import { SQLite3Adapter } from "./sqlite3-adapter.js";

describe("has_default_function?", () => {
  for (const [name, adapter] of [
    ["PostgreSQLAdapter", PostgreSQLAdapter.prototype],
    ["SQLite3Adapter", SQLite3Adapter.prototype],
  ] as const) {
    describe(name, () => {
      it("answers false for a null default", () => {
        expect(adapter.hasDefaultFunction(null, null)).toBe(false);
        expect(adapter.extractDefaultFunction(null, null)).toBeNull();
      });

      it("treats a false default value as no default value", () => {
        expect(adapter.hasDefaultFunction(false, "CURRENT_TIMESTAMP")).toBe(true);
        expect(adapter.extractDefaultFunction(false, "CURRENT_TIMESTAMP")).toBe(
          "CURRENT_TIMESTAMP",
        );
      });

      it("answers false once a default value was extracted", () => {
        expect(adapter.hasDefaultFunction("", "CURRENT_TIMESTAMP")).toBe(false);
        expect(adapter.hasDefaultFunction(0, "CURRENT_TIMESTAMP")).toBe(false);
      });

      it("matches a function call", () => {
        expect(adapter.hasDefaultFunction(null, "random()")).toBe(true);
        expect(adapter.hasDefaultFunction(null, "null")).toBe(false);
      });
    });
  }
});
