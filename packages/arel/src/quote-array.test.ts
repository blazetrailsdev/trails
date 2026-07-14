import { describe, it, expect } from "vitest";
import { quoteArrayLiteral } from "./quote-array.js";

describe("quoteArrayLiteral", () => {
  it("formats simple string arrays", () => {
    expect(quoteArrayLiteral(["a", "b", "c"])).toBe("{a,b,c}");
  });

  it("formats integer arrays", () => {
    expect(quoteArrayLiteral([1, 2, 3])).toBe("{1,2,3}");
  });

  it("handles null elements", () => {
    expect(quoteArrayLiteral(["a", null, "b"])).toBe("{a,NULL,b}");
  });

  it("handles nested arrays", () => {
    expect(
      quoteArrayLiteral([
        [1, 2],
        [3, 4],
      ]),
    ).toBe("{{1,2},{3,4}}");
  });

  it("escapes double quotes", () => {
    expect(quoteArrayLiteral(['he said "hi"'])).toBe('{"he said \\"hi\\""}');
  });

  it("escapes backslashes", () => {
    expect(quoteArrayLiteral(["a\\b"])).toBe('{"a\\\\b"}');
  });

  it("handles booleans", () => {
    expect(quoteArrayLiteral([true, false])).toBe("{TRUE,FALSE}");
  });

  it("handles Date values with toISOString", () => {
    const d = new Date("2026-03-26T12:00:00.000Z");
    expect(quoteArrayLiteral([d])).toBe(`{${d.toISOString()}}`);
  });

  it("handles empty arrays", () => {
    expect(quoteArrayLiteral([])).toBe("{}");
  });

  it("handles objects with toISOString", () => {
    const obj = { toISOString: () => "2026-01-01T00:00:00Z" };
    expect(quoteArrayLiteral([obj])).toBe("{2026-01-01T00:00:00Z}");
  });

  it("handles bigint values inside objects", () => {
    expect(quoteArrayLiteral([{ id: 42n }])).toBe('{"{\\"id\\":\\"42\\"}"}');
  });

  // Each expectation below was captured from `PG::TextEncoder::Array#encode`,
  // the encoder Rails hands the type_cast values to (`postgresql/quoting.rb:212`).
  describe("quotes elements by content, as PG::TextEncoder::Array does", () => {
    it("leaves an unambiguous element bare", () => {
      expect(quoteArrayLiteral(["a"])).toBe("{a}");
    });

    it("quotes an empty element", () => {
      expect(quoteArrayLiteral([""])).toBe('{""}');
    });

    it("quotes an element that would otherwise read as the NULL literal", () => {
      expect(quoteArrayLiteral(["NULL"])).toBe('{"NULL"}');
      expect(quoteArrayLiteral(["null"])).toBe('{"null"}');
      expect(quoteArrayLiteral(["NuLl"])).toBe('{"NuLl"}');
    });

    it("leaves an element merely containing NULL bare", () => {
      expect(quoteArrayLiteral(["NULLx", "xNULL"])).toBe("{NULLx,xNULL}");
    });

    it("quotes an element containing whitespace", () => {
      expect(quoteArrayLiteral(["a b"])).toBe('{"a b"}');
      expect(quoteArrayLiteral([" a"])).toBe('{" a"}');
      expect(quoteArrayLiteral(["a "])).toBe('{"a "}');
      expect(quoteArrayLiteral(["a\tb"])).toBe('{"a\tb"}');
      expect(quoteArrayLiteral(["a\nb"])).toBe('{"a\nb"}');
    });

    it("quotes an element containing a delimiter", () => {
      expect(quoteArrayLiteral(["a,b"])).toBe('{"a,b"}');
      expect(quoteArrayLiteral(["a{b"])).toBe('{"a{b"}');
      expect(quoteArrayLiteral(["a}b"])).toBe('{"a}b"}');
    });

    it("leaves an element with other punctuation bare", () => {
      expect(quoteArrayLiteral(["a.b", "a-b", "a|b", "a(b"])).toBe("{a.b,a-b,a|b,a(b}");
    });

    it("never inspects type, so the string 'true' encodes like the boolean", () => {
      expect(quoteArrayLiteral(["true"])).toBe("{true}");
      expect(quoteArrayLiteral(["1"])).toBe("{1}");
    });

    it("leaves a bare nested array element unquoted", () => {
      expect(quoteArrayLiteral([["x"]])).toBe("{{x}}");
    });

    it("encodes a mixed array as the Ruby encoder does", () => {
      expect(
        quoteArrayLiteral([true, false, "a", "2026-04-26 14:23:55", 1], (v) =>
          typeof v === "boolean" ? String(v) : undefined,
        ),
      ).toBe('{true,false,a,"2026-04-26 14:23:55",1}');
    });
  });

  describe("formatElement", () => {
    it("quotes a formatted element whose content needs it", () => {
      const d = new Date("2026-03-26T12:00:00.000Z");
      expect(quoteArrayLiteral([d], () => "2026-03-26 12:00:00")).toBe('{"2026-03-26 12:00:00"}');
    });

    it("falls through to the default handling when it returns undefined", () => {
      expect(quoteArrayLiteral(["a", 1], () => undefined)).toBe("{a,1}");
    });

    it("escapes quotes and backslashes in a formatted element", () => {
      expect(quoteArrayLiteral(["x"], () => 'a\\b"c')).toBe('{"a\\\\b\\"c"}');
    });

    it("applies to nested array elements", () => {
      expect(quoteArrayLiteral([["x"]], (v) => (v === "x" ? "X" : undefined))).toBe("{{X}}");
    });

    it("is offered numbers and booleans, which Rails also sends through type_cast", () => {
      // type_cast_array recurses only `when ::Array`; every other element goes
      // to type_cast, so the hook must see numbers/booleans too. Without this
      // ordering a caller could never converge them (e.g. unquoted_true).
      const seen: unknown[] = [];
      quoteArrayLiteral([1, true, "s"], (v) => {
        seen.push(v);
        return undefined;
      });
      expect(seen).toEqual([1, true, "s"]);
    });

    it("lets the hook format a number element", () => {
      expect(quoteArrayLiteral([1], (v) => (v === 1 ? "one" : undefined))).toBe("{one}");
    });
  });
});
