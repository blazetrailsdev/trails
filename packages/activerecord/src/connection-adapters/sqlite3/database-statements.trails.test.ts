import { describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { isWriteQuery } from "./database-statements.js";

describe("SQLite3::DatabaseStatements#isWriteQuery", () => {
  it("retries the match against the bytes when the first match raises ArgumentError", () => {
    let matches = 0;
    const sql = {
      toString() {
        if (matches++ === 0) throw new ArgumentError("invalid byte sequence in UTF-8");
        return "SELECT 1";
      },
    } as unknown as string;

    expect(isWriteQuery(sql)).toBe(false);
  });

  it("re-raises anything but ArgumentError", () => {
    const sql = {
      toString() {
        throw new TypeError("boom");
      },
    } as unknown as string;

    expect(() => isWriteQuery(sql)).toThrow(TypeError);
  });
});
