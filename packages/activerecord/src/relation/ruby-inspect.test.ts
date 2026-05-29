import { describe, it, expect } from "vitest";
import { Nodes } from "@blazetrails/arel";
import {
  rubyInspect,
  rubyInspectArray,
  inspectArelValue,
  inspectOrderClause,
} from "./ruby-inspect.js";

describe("rubyInspect", () => {
  it("renders nil / undefined as 'nil'", () => {
    expect(rubyInspect(null)).toBe("nil");
    expect(rubyInspect(undefined)).toBe("nil");
  });

  it("renders booleans as 'true' / 'false'", () => {
    expect(rubyInspect(true)).toBe("true");
    expect(rubyInspect(false)).toBe("false");
  });

  it("renders numbers bare (no quotes)", () => {
    expect(rubyInspect(42)).toBe("42");
    expect(rubyInspect(3.14)).toBe("3.14");
    expect(rubyInspect(-7)).toBe("-7");
  });

  it("renders bigints as their decimal string (matches Ruby's Integer#inspect)", () => {
    expect(rubyInspect(BigInt("9007199254740993"))).toBe("9007199254740993");
  });

  it('renders strings with double-quotes, escaping embedded " and \\', () => {
    expect(rubyInspect("foo")).toBe('"foo"');
    expect(rubyInspect('he said "hi"')).toBe('"he said \\"hi\\""');
    expect(rubyInspect("back\\slash")).toBe('"back\\\\slash"');
  });

  it("rubyInspectArray joins with ', ' and wraps in []", () => {
    expect(rubyInspectArray([1, "foo", null])).toBe('[1, "foo", nil]');
    expect(rubyInspectArray([])).toBe("[]");
    expect(rubyInspectArray([true, false, 0])).toBe("[true, false, 0]");
  });

  it("escapes common control characters the way Ruby's String#inspect does", () => {
    expect(rubyInspect("line1\nline2")).toBe('"line1\\nline2"');
    expect(rubyInspect("col1\tcol2")).toBe('"col1\\tcol2"');
    expect(rubyInspect("cr\r\n")).toBe('"cr\\r\\n"');
    expect(rubyInspect("null\0char")).toBe('"null\\0char"');
    expect(rubyInspect("esc\x1bseq")).toBe('"esc\\eseq"');
    // Output stays single-line so an EXPLAIN header can't span
    // multiple lines based on bind contents.
    expect(rubyInspect("a\nb")).not.toContain("\n");
  });

  it("handles nested arrays", () => {
    expect(
      rubyInspectArray([
        [1, 2],
        ["a", "b"],
      ]),
    ).toBe('[[1, 2], ["a", "b"]]');
  });
});

describe("inspectArelValue", () => {
  it("stringifies a SqlLiteral via its value", () => {
    expect(inspectArelValue(new Nodes.SqlLiteral("count(*)"))).toBe('sql("count(*)")');
  });

  it("stringifies a generic Arel Node via toSql() instead of [object Object]", () => {
    const node = new Nodes.SqlLiteral("posts.views").desc();
    const out = inspectArelValue(node);
    expect(out).not.toContain("[object Object]");
    expect(out).toContain("sql(");
    expect(out).toContain("posts.views");
  });

  it("renders symbols by their description", () => {
    expect(inspectArelValue(Symbol("name"))).toBe("name");
  });

  it("falls back to JSON for plain values", () => {
    expect(inspectArelValue("name")).toBe('"name"');
  });
});

describe("inspectOrderClause", () => {
  it("renders a [column, direction] tuple as a quoted fragment", () => {
    expect(inspectOrderClause(["views", "desc"])).toBe('"views desc"');
  });

  it("renders a { raw } SQL fragment", () => {
    expect(inspectOrderClause({ raw: "RANDOM()" })).toBe('sql("RANDOM()")');
  });

  it("stringifies an Arel Node order via toSql()", () => {
    const node = new Nodes.SqlLiteral("name").asc();
    const out = inspectOrderClause(node);
    expect(out).not.toContain("[object Object]");
    expect(out).toContain("name");
  });
});
