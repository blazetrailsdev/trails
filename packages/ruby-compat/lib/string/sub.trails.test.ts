import { describe, expect, it } from "vitest";
import { rbStrScanSubexpCall } from "./sub.js";

describe("String#scan with a group that calls itself", () => {
  const head = /CONSTRAINT\s+(?<name>\w+)\s+CHECK\s+\(/i;

  it("answers the head's captures and the balanced group for each match", () => {
    const sql =
      "CREATE TABLE t (a int, CONSTRAINT chk_a CHECK (a > 0 AND (a < 5 OR f(a))), " +
      "constraint c2 check (lower(n) = n))";
    expect(rbStrScanSubexpCall(sql, head)).toEqual([
      ["chk_a", "a > 0 AND (a < 5 OR f(a))"],
      ["c2", "lower(n) = n"],
    ]);
  });

  it("skips a head whose group is empty, holds an empty group or is never closed", () => {
    expect(rbStrScanSubexpCall("CONSTRAINT a CHECK ()", head)).toEqual([]);
    expect(rbStrScanSubexpCall("CONSTRAINT a CHECK (f())", head)).toEqual([]);
    expect(rbStrScanSubexpCall("CONSTRAINT a CHECK (b > (1)", head)).toEqual([]);
    expect(rbStrScanSubexpCall("", head)).toEqual([]);
  });
});
