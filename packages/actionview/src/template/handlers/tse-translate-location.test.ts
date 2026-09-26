import { tokenize } from "@blazetrails/activesupport";
import { describe, it, expect } from "vitest";
import {
  LocationParsingError,
  findOffset,
  sourceLines,
  translateLocation,
} from "./tse-translate-location.js";

describe("sourceLines", () => {
  it("matches Ruby's String#lines (keeps trailing separators)", () => {
    expect(sourceLines("a\nb\nc")).toEqual(["a\n", "b\n", "c"]);
    expect(sourceLines("a\nb\n")).toEqual(["a\n", "b\n"]);
    expect(sourceLines("")).toEqual([]);
  });
});

describe("findOffset", () => {
  it("returns the source-line column for a CODE token matched in compiled output", () => {
    const tokens = tokenize("<%= name %>");
    const compiled = "_ob.append( name );";
    const errorColumn = compiled.indexOf("name");
    expect(findOffset(compiled, tokens, errorColumn)).toBe(4);
  });

  it("counts a `<%%` OPEN token at its own width", () => {
    const tokens = tokenize("a <%% b %> <%= x %>");
    const compiled = '_ob.safeAppend("a <% b %> "); _ob.append( x );';
    expect(findOffset(compiled, tokens, compiled.indexOf("x )"))).toBe(15);
  });

  it("throws LocationParsingError when no anchor is found", () => {
    expect(() => findOffset("nothing here", tokenize("<%= x %>"), 0)).toThrow(LocationParsingError);
  });
});

describe("translateLocation", () => {
  it("mutates and returns the spot on success", () => {
    const source = "line1\n<%= value %>\n";
    const spot = {
      snippet: "_ob.append( value );",
      firstLineno: 2,
      lastLineno: 2,
      firstColumn: 12,
      lastColumn: 17,
    };
    const out = translateLocation(spot, { lineno: 2 }, source);
    expect(out).toBe(spot);
    expect(out!.firstColumn).toBe(4);
    expect(out!.scriptLines).toEqual(["line1\n", "<%= value %>\n"]);
  });

  it("returns null when the backtrace line exceeds source line count", () => {
    expect(
      translateLocation(
        { snippet: "x", firstLineno: 1, lastLineno: 1, firstColumn: 0, lastColumn: 0 },
        { lineno: 5 },
        "only\none\n",
      ),
    ).toBeNull();
  });

  it("returns null when find_offset throws LocationParsingError", () => {
    expect(
      translateLocation(
        { snippet: "no-match", firstLineno: 1, lastLineno: 1, firstColumn: 0, lastColumn: 0 },
        { lineno: 1 },
        "<%= x %>",
      ),
    ).toBeNull();
  });
});
