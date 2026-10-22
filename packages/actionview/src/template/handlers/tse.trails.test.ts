import { compileJs } from "@blazetrails/tse-compiler";
import { describe, it, expect } from "vitest";
import { TSE } from "./tse.js";

const tse = new TSE();
const translateLocation = tse.translateLocation.bind(tse);
const firstColumnOf = (source: string, compiled: string, errorColumn: number) =>
  translateLocation(
    {
      snippet: compiled,
      firstLineno: 1,
      lastLineno: 1,
      firstColumn: errorColumn,
      lastColumn: errorColumn,
    },
    { lineno: 1 },
    source,
  )?.firstColumn;

describe("findOffset", () => {
  it("returns the source-line column for a CODE token matched in compiled output", () => {
    const compiled = "_ob.append( name );";
    expect(firstColumnOf("<%= name %>", compiled, compiled.indexOf("name"))).toBe(4);
  });

  it("counts a `<%%` OPEN token at its own width", () => {
    const compiled = '_ob.safeAppend("a <% b %> "); _ob.append( x );';
    expect(firstColumnOf("a <%% b %> <%= x %>", compiled, compiled.indexOf("x )"))).toBe(15);
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

  it("translates an error raised on a block-expression line to its template column", () => {
    const source = "<ul>\n<%= boom(items, (item) => { %>\n<li><%= item %></li>\n<% }) %>\n</ul>\n";
    const snippet = compileJs(source).code.split("\n")[1];
    const firstColumn = snippet.indexOf("boom");
    const spot = {
      snippet,
      firstLineno: 2,
      lastLineno: 2,
      firstColumn,
      lastColumn: firstColumn + 4,
    };
    const out = translateLocation(spot, { lineno: 2 }, source);
    expect(out).not.toBeNull();
    expect(out!.firstColumn).toBe(4);
    expect(out!.lastColumn).toBe(8);
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
