import { describe, it, expect } from "vitest";
import { Coder } from "../../../pg/coder.js";
import { PGTextDecoder, PGTypeMapByOid } from "../pg-text-decoder.js";
import { PG } from "../../../pg/pg.js";

describe("PostgreSQL array literal encoding", () => {
  const encoder = new PG.TextEncoder.Array(null, { name: "text[]", delimiter: "," });
  const encode = (values: unknown[]): string => encoder.encode(values);

  it("emits unambiguous elements bare", () => {
    expect(encode(["a", "b"])).toBe("{a,b}");
  });

  it("emits booleans unquoted", () => {
    expect(encode([true, false])).toBe("{true,false}");
  });

  it("recurses into nested arrays", () => {
    expect(encode([["a"], ["b", "c"]])).toBe("{{a},{b,c}}");
  });

  it("emits nil as the bare NULL token", () => {
    expect(encode([null])).toBe("{NULL}");
  });

  it("quotes the NULL string case-insensitively", () => {
    expect(encode(["NULL", "null"])).toBe('{"NULL","null"}');
  });

  it("quotes empty strings", () => {
    expect(encode([""])).toBe('{""}');
  });

  it("quotes delimiter-bearing content", () => {
    expect(encode(["a,b"])).toBe('{"a,b"}');
  });

  it("quotes whitespace content", () => {
    expect(encode(["a b", "a\tb"])).toBe('{"a b","a\tb"}');
  });

  it("escapes quotes and backslashes", () => {
    expect(encode(['he said "hi"', "a\\b"])).toBe('{"he said \\"hi\\"","a\\\\b"}');
  });

  it("quotes braces", () => {
    expect(encode(["{a}"])).toBe('{"{a}"}');
  });

  it("leaves non-ASCII whitespace bare", () => {
    expect(encode(["a\u00a0b"])).toBe("{a\u00a0b}");
  });
});

describe("PG::CompositeCoder", () => {
  it("delimiter defaults to a comma and must be one byte", () => {
    expect(new PG.TextEncoder.Array().delimiter).toBe(",");
    expect(() => new PG.TextEncoder.Array(null, { delimiter: "ab" })).toThrow(
      "delimiter size must be one byte",
    );
  });

  it("encodes through elements_type and needs_quotation", () => {
    class Upcase extends Coder {
      encode(value: string): string {
        return value.toUpperCase();
      }
    }
    const outer = new PG.TextEncoder.Array(null, { elementsType: new Upcase() });
    expect(outer.encode([["a b"], null])).toBe('{{"A B"},NULL}');
    expect(new PG.TextEncoder.Array(null, { needsQuotation: false }).encode(["a b"])).toBe("{a b}");
    expect(outer.encode(null)).toBeNull();
    expect(outer.encode(1)).toBe("1");
    expect(() => new PG.TextEncoder.Array(null, { elementsType: 1 })).toThrow(
      "wrong elements type Integer (expected some kind of PG::Coder)",
    );
  });
});

describe("PG::TextDecoder::Array", () => {
  it("decodes nil to nil, skips dimensions, and reads a malformed literal as the gem does", () => {
    const decoder = new PG.TextDecoder.Array();
    expect(decoder.decode(null)).toBeNull();
    expect(decoder.decode("[1:2]={a,b}")).toEqual(["a", "b"]);
    expect(decoder.decode("{a,b")).toEqual(["a"]);
    expect(decoder.decode("{a,{b,c")).toEqual(["a", ["b"]]);
    expect(decoder.decode('{a,"b')).toEqual(["a"]);
    expect(decoder.decode("xa,b}")).toEqual(["a", "b"]);
    expect(decoder.decode("a,b")).toEqual([""]);
    expect(decoder.decode("{a,b} junk")).toEqual(["a", "b"]);
    expect(decoder.decode("{")).toEqual([]);
    expect(decoder.decode("{a} junk}")).toEqual(["a"]);
    expect(decoder.decode("{a}}")).toEqual(["a"]);
    expect(decoder.decode(" {a}")).toEqual(["a"]);
    expect(decoder.decode('{NULL,"NULL",null}')).toEqual([null, "NULL", "null"]);
    expect(decoder.decode("{{a,b},{c}}")).toEqual([["a", "b"], ["c"]]);
    expect(decoder.decode("[1:2={a}")).toEqual([["a"]]);
  });

  it("raises the parser's TypeError under FORMAT_ERROR_TO_RAISE", () => {
    const decoder = new PG.TextDecoder.Array(null, { flags: Coder.FORMAT_ERROR_TO_RAISE });
    expect(() => decoder.decode("{a")).toThrow("premature end of the array string");
  });
});

describe("PG::Result", () => {
  const native = () =>
    ({ fields: [{ name: "n", dataTypeID: 23, dataTypeModifier: -1 }], rows: [["1"]] }) as never;

  it("type_map= casts per read, so setting it twice is safe", () => {
    const result = new PG.Result(native());
    const typeMap = new PGTypeMapByOid().addCoder(
      new PGTextDecoder.Integer({ oid: 23, name: "int4" }),
    );
    result.typeMap = typeMap;
    expect(result.mapTypesBang(typeMap).values()).toEqual([[1]]);
    expect(result.getvalue(0, 0)).toBe(1);
    expect(result[0]).toEqual({ n: 1 });
  });

  it("raises ArgumentError out of range", () => {
    const result = new PG.Result(native());
    expect(() => result.ftype(1)).toThrow("invalid field number 1");
    expect(() => result.fmod(1)).toThrow("Column number is out of range: 1");
    expect(() => result.getvalue(1, 0)).toThrow("invalid tuple number 1");
  });
});
