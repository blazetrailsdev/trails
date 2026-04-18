import { describe, it, expect } from "vitest";
import { quote, quotedDate, quotedTimeUtc, typeCast } from "./quoting.js";

describe("MySQL quoting — quote", () => {
  it("returns NULL for null / undefined", () => {
    expect(quote(null)).toBe("NULL");
    expect(quote(undefined)).toBe("NULL");
  });

  it("renders booleans as 1 / 0 (MySQL convention)", () => {
    expect(quote(true)).toBe("1");
    expect(quote(false)).toBe("0");
  });

  it("renders numbers / bigints bare", () => {
    expect(quote(42)).toBe("42");
    expect(quote(BigInt("9007199254740993"))).toBe("9007199254740993");
  });

  it("renders Date values as the full datetime (YYYY-MM-DD HH:MM:SS…), not date-only", () => {
    // JS `Date` always carries a time component. Matches Rails' MySQL
    // adapter treating JS datetimes as full timestamps rather than
    // dropping the time to the `quotedDate` form.
    const d = new Date(Date.UTC(2026, 0, 2, 12, 34, 56));
    const out = quote(d);
    expect(out).toMatch(/^'2026-01-02 12:34:56/);
    expect(out.endsWith("'")).toBe(true);
  });

  it("quotes strings with MySQL-specific escapes (\\n, \\0, \\Z, \\\\)", () => {
    expect(quote("a\nb")).toBe("'a\\nb'");
    expect(quote("null\0byte")).toBe("'null\\0byte'");
    expect(quote("with 'quote'")).toBe("'with ''quote'''");
  });
});

describe("MySQL quoting — typeCast", () => {
  it("returns null / undefined unchanged for nil-like values", () => {
    expect(typeCast(null)).toBe(null);
    expect(typeCast(undefined)).toBe(undefined);
  });

  it("collapses booleans to 1 / 0 (MySQL convention)", () => {
    expect(typeCast(true)).toBe(1);
    expect(typeCast(false)).toBe(0);
  });

  it("passes strings, numbers, bigints through unchanged", () => {
    expect(typeCast("foo")).toBe("foo");
    expect(typeCast(42)).toBe(42);
    expect(typeCast(BigInt(9))).toBe(BigInt(9));
  });

  it("returns Date as the full unquoted datetime string (no surrounding quotes)", () => {
    // typeCast's contract: unquoted primitive suitable as a bind
    // value. It's `quote()`'s job to add the surrounding quotes.
    const d = new Date(Date.UTC(2026, 0, 2, 12, 34, 56));
    const out = typeCast(d) as string;
    expect(out.startsWith("'")).toBe(false);
    expect(out.endsWith("'")).toBe(false);
    expect(out).toMatch(/^2026-01-02 12:34:56/);
  });
});

describe("MySQL quoting — quotedDate / quotedTimeUtc", () => {
  it("quotedDate returns the unquoted :db form (Rails quoted_date)", () => {
    const d = new Date(Date.UTC(2026, 3, 18, 12, 34, 56));
    const out = quotedDate(d);
    expect(out).toBe("2026-04-18 12:34:56");
    expect(out.startsWith("'")).toBe(false);
    expect(out).not.toMatch(/\.000$/);
  });

  it("quotedDate includes .microseconds when ms > 0", () => {
    const d = new Date(Date.UTC(2026, 3, 18, 12, 34, 56, 250));
    expect(quotedDate(d)).toMatch(/^2026-04-18 12:34:56\.\d{6}$/);
  });

  it("quotedTimeUtc returns the time-only tail", () => {
    const d = new Date(Date.UTC(2026, 3, 18, 12, 34, 56));
    expect(quotedTimeUtc(d)).toBe("12:34:56");
  });
});
