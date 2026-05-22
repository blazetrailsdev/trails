import { describe, it, expect } from "vitest";
import {
  LocationParsingError,
  findOffset,
  sourceLines,
  tokenizeLine,
  translateLocation,
} from "./tse-translate-location.js";

describe("sourceLines", () => {
  it("matches Ruby's String#lines (keeps trailing separators)", () => {
    expect(sourceLines("a\nb\nc")).toEqual(["a\n", "b\n", "c"]);
    expect(sourceLines("a\nb\n")).toEqual(["a\n", "b\n"]);
    expect(sourceLines("")).toEqual([]);
  });
});

describe("tokenizeLine", () => {
  it("yields CODE for tag contents (trimmed, matching the compiler) and TEXT for static spans", () => {
    expect(tokenizeLine("hi <%= name %>!")).toEqual([
      { kind: "TEXT", value: "hi " },
      { kind: "CODE", value: "name" },
      { kind: "TEXT", value: "!" },
    ]);
  });

  it("strips the trim `-` markers from CODE bounds", () => {
    expect(tokenizeLine("<%- x -%>")).toEqual([{ kind: "CODE", value: "x" }]);
  });

  it("consumes following `[ \\t]*\\r?\\n` after a `-%>` tag (trim-right parity with the lexer)", () => {
    expect(tokenizeLine("<%= x -%>\n")).toEqual([{ kind: "CODE", value: "x" }]);
    expect(tokenizeLine("a <%= x -%>  \nb")).toEqual([
      { kind: "TEXT", value: "a " },
      { kind: "CODE", value: "x" },
      { kind: "TEXT", value: "b" },
    ]);
  });

  it("strips trailing `[ \\t]*` from preceding TEXT when a `<%-` tag opens", () => {
    expect(tokenizeLine("hi   \t<%- x %> after")).toEqual([
      { kind: "TEXT", value: "hi" },
      { kind: "CODE", value: "x" },
      { kind: "TEXT", value: " after" },
    ]);
  });

  it("returns an empty token list for a line with no tags and no text", () => {
    expect(tokenizeLine("")).toEqual([]);
  });

  it("drops `<%# ... %>` comments — they're absent from compiled output", () => {
    expect(tokenizeLine("a <%# note %> <%= x %>")).toEqual([
      { kind: "TEXT", value: "a " },
      { kind: "TEXT", value: " " },
      { kind: "CODE", value: "x" },
    ]);
  });

  it("drops `<%! types: ... !%>` typesMagic blocks", () => {
    expect(tokenizeLine("pre <%! types: T !%> <%= x %>")).toEqual([
      { kind: "TEXT", value: "pre " },
      { kind: "TEXT", value: " " },
      { kind: "CODE", value: "x" },
    ]);
  });

  it("treats `<%%` / `%%>` as literal TEXT, not as code-tag delimiters", () => {
    expect(tokenizeLine("a <%% b %%> c")).toEqual([{ kind: "TEXT", value: "a <% b %> c" }]);
    expect(tokenizeLine("<%% <%= x %> %%>")).toEqual([
      { kind: "TEXT", value: "<% " },
      { kind: "CODE", value: "x" },
      { kind: "TEXT", value: " %>" },
    ]);
  });
});

describe("findOffset", () => {
  it("returns the source-line column for a CODE token matched in compiled output", () => {
    // The compiler trims tag bodies (parser.ts), so `<%= name %>` emits
    // `_ob.append(name);` and the CODE anchor string is `"name"`. The
    // returned column is relative to the concatenated source-token content
    // (delimiters excluded from the accounting), so column 0 = 'n'.
    const tokens = tokenizeLine("<%= name %>");
    const compiled = "_ob.append(name);";
    const errorColumn = compiled.indexOf("name");
    expect(findOffset(compiled, tokens, errorColumn)).toBe(0);
  });

  it("throws LocationParsingError when no anchor is found", () => {
    expect(() => findOffset("nothing here", tokenizeLine("<%= x %>"), 0)).toThrow(
      LocationParsingError,
    );
  });
});

describe("translateLocation", () => {
  it("mutates and returns the spot on success", () => {
    const source = "line1\n<%= value %>\n";
    const spot = {
      snippet: "_ob.append(value);",
      firstLineno: 2,
      lastLineno: 2,
      firstColumn: 11,
      lastColumn: 16,
    };
    const out = translateLocation(spot, { lineno: 2 }, source);
    expect(out).toBe(spot);
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
