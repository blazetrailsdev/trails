import { describe, it, expect } from "vitest";
import { quoteArrayLiteral } from "./quote-array.js";
import { defaultQuoter } from "./visitors/default-quoter.js";

describe("quoteArrayLiteral", () => {
  it("formats simple string arrays", () => {
    expect(quoteArrayLiteral(["a", "b", "c"], defaultQuoter)).toBe("{a,b,c}");
  });

  it("formats integer arrays", () => {
    expect(quoteArrayLiteral([1, 2, 3], defaultQuoter)).toBe("{1,2,3}");
  });

  it("handles null elements", () => {
    expect(quoteArrayLiteral(["a", null, "b"], defaultQuoter)).toBe("{a,NULL,b}");
  });

  it("handles nested arrays", () => {
    expect(
      quoteArrayLiteral(
        [
          [1, 2],
          [3, 4],
        ],
        defaultQuoter,
      ),
    ).toBe("{{1,2},{3,4}}");
  });

  it("escapes double quotes", () => {
    expect(quoteArrayLiteral(['he said "hi"'], defaultQuoter)).toBe('{"he said \\"hi\\""}');
  });

  it("escapes backslashes", () => {
    expect(quoteArrayLiteral(["a\\b"], defaultQuoter)).toBe('{"a\\\\b"}');
  });

  it("handles booleans", () => {
    // type_cast -> unquoted_true/false (abstract/quoting.rb:94-107); PG inherits
    // Ruby true/false and the encoder leaves them bare. Verified against Ruby:
    // PG::TextEncoder::Array.new.encode([true, false]) => "{true,false}".
    expect(quoteArrayLiteral([true, false], defaultQuoter)).toBe("{true,false}");
  });

  describe("unquoted_true / unquoted_false", () => {
    it("dispatches booleans through the connection's unquoted pair", () => {
      // MySQL and SQLite both override the pair to 1/0 (mysql/quoting.rb:72-79,
      // sqlite3/quoting.rb:87-97); a hard-coded TRUE/FALSE could never reach it.
      const oneZero = { unquotedTrue: () => 1, unquotedFalse: () => 0 };
      expect(quoteArrayLiteral([true, false], oneZero)).toBe("{1,0}");
    });

    it("dispatches nested array booleans through the connection too", () => {
      const oneZero = { unquotedTrue: () => 1, unquotedFalse: () => 0 };
      expect(quoteArrayLiteral([[true], false], oneZero)).toBe("{{1},0}");
    });
  });

  it("handles Date values with toISOString", () => {
    const d = new Date("2026-03-26T12:00:00.000Z");
    expect(quoteArrayLiteral([d], defaultQuoter)).toBe(`{${d.toISOString()}}`);
  });

  it("handles empty arrays", () => {
    expect(quoteArrayLiteral([], defaultQuoter)).toBe("{}");
  });

  it("handles objects with toISOString", () => {
    const obj = { toISOString: () => "2026-01-01T00:00:00Z" };
    expect(quoteArrayLiteral([obj], defaultQuoter)).toBe("{2026-01-01T00:00:00Z}");
  });

  it("handles bigint values inside objects", () => {
    expect(quoteArrayLiteral([{ id: 42n }], defaultQuoter)).toBe('{"{\\"id\\":\\"42\\"}"}');
  });

  // Each expectation below was captured from `PG::TextEncoder::Array#encode`,
  // the encoder Rails hands the type_cast values to (`postgresql/quoting.rb:212`).
  describe("quotes elements by content, as PG::TextEncoder::Array does", () => {
    it("leaves an unambiguous element bare", () => {
      expect(quoteArrayLiteral(["a"], defaultQuoter)).toBe("{a}");
    });

    it("quotes an empty element", () => {
      expect(quoteArrayLiteral([""], defaultQuoter)).toBe('{""}');
    });

    it("quotes an element that would otherwise read as the NULL literal", () => {
      expect(quoteArrayLiteral(["NULL"], defaultQuoter)).toBe('{"NULL"}');
      expect(quoteArrayLiteral(["null"], defaultQuoter)).toBe('{"null"}');
      expect(quoteArrayLiteral(["NuLl"], defaultQuoter)).toBe('{"NuLl"}');
    });

    it("leaves an element merely containing NULL bare", () => {
      expect(quoteArrayLiteral(["NULLx", "xNULL"], defaultQuoter)).toBe("{NULLx,xNULL}");
    });

    it("quotes an element containing whitespace", () => {
      expect(quoteArrayLiteral(["a b"], defaultQuoter)).toBe('{"a b"}');
      expect(quoteArrayLiteral([" a"], defaultQuoter)).toBe('{" a"}');
      expect(quoteArrayLiteral(["a "], defaultQuoter)).toBe('{"a "}');
      expect(quoteArrayLiteral(["a\tb"], defaultQuoter)).toBe('{"a\tb"}');
      expect(quoteArrayLiteral(["a\nb"], defaultQuoter)).toBe('{"a\nb"}');
    });

    it("quotes an element containing a delimiter", () => {
      expect(quoteArrayLiteral(["a,b"], defaultQuoter)).toBe('{"a,b"}');
      expect(quoteArrayLiteral(["a{b"], defaultQuoter)).toBe('{"a{b"}');
      expect(quoteArrayLiteral(["a}b"], defaultQuoter)).toBe('{"a}b"}');
    });

    it("leaves an element with other punctuation bare", () => {
      expect(quoteArrayLiteral(["a.b", "a-b", "a|b", "a(b"], defaultQuoter)).toBe(
        "{a.b,a-b,a|b,a(b}",
      );
    });

    it("leaves a string that reads as a literal bare", () => {
      // The encoder stage never inspects type — it sees only the text
      // `type_cast` produced. These strings need no quoting, so they emit bare
      // and become indistinguishable from the scalars they resemble, exactly
      // as `PG::TextEncoder::Array` does. (The *boolean* `true` still encodes
      // as `{TRUE}` until #4869 converges the type_cast arm onto
      // `unquoted_true`; that divergence lives in the cast stage, not here.)
      expect(quoteArrayLiteral(["true"], defaultQuoter)).toBe("{true}");
      expect(quoteArrayLiteral(["1"], defaultQuoter)).toBe("{1}");
    });

    it("leaves a bare nested array element unquoted", () => {
      expect(quoteArrayLiteral([["x"]], defaultQuoter)).toBe("{{x}}");
    });

    it("encodes a mixed array as the Ruby encoder does", () => {
      // Booleans need no hook now that the cast arm dispatches to
      // unquoted_true/unquoted_false. Matches Ruby exactly:
      //   PG::TextEncoder::Array.new.encode([true, false, "a", "2026-04-26 14:23:55", 1])
      expect(quoteArrayLiteral([true, false, "a", "2026-04-26 14:23:55", 1], defaultQuoter)).toBe(
        '{true,false,a,"2026-04-26 14:23:55",1}',
      );
    });
  });

  describe("formatElement", () => {
    it("quotes a formatted element whose content needs it", () => {
      const d = new Date("2026-03-26T12:00:00.000Z");
      expect(quoteArrayLiteral([d], defaultQuoter, () => "2026-03-26 12:00:00")).toBe(
        '{"2026-03-26 12:00:00"}',
      );
    });

    it("falls through to the default handling when it returns undefined", () => {
      expect(quoteArrayLiteral(["a", 1], defaultQuoter, () => undefined)).toBe("{a,1}");
    });

    it("escapes quotes and backslashes in a formatted element", () => {
      expect(quoteArrayLiteral(["x"], defaultQuoter, () => 'a\\b"c')).toBe('{"a\\\\b\\"c"}');
    });

    it("applies to nested array elements", () => {
      expect(quoteArrayLiteral([["x"]], defaultQuoter, (v) => (v === "x" ? "X" : undefined))).toBe(
        "{{X}}",
      );
    });

    it("is offered numbers and booleans, which Rails also sends through type_cast", () => {
      // type_cast_array recurses only `when ::Array`; every other element goes
      // to type_cast, so the hook must see numbers/booleans too. Without this
      // ordering a caller could never converge them (e.g. unquoted_true).
      const seen: unknown[] = [];
      quoteArrayLiteral([1, true, "s"], defaultQuoter, (v) => {
        seen.push(v);
        return undefined;
      });
      expect(seen).toEqual([1, true, "s"]);
    });

    it("is offered nil, which Rails' type_cast takes through `when nil`", () => {
      const seen: unknown[] = [];
      expect(
        quoteArrayLiteral([null], defaultQuoter, (v) => {
          seen.push(v);
          return undefined;
        }),
      ).toBe("{NULL}");
      expect(seen).toEqual([null]);
    });

    it("lets the hook format a number element", () => {
      expect(quoteArrayLiteral([1], defaultQuoter, (v) => (v === 1 ? "one" : undefined))).toBe(
        "{one}",
      );
    });
  });
});
