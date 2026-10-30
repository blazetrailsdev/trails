import { describe, expect, it } from "vitest";
import { Utilities } from "./utilities.js";

const {
  isTokenSafe,
  quoteToken,
  isAtomSafe,
  quoteAtom,
  quotePhrase,
  escapeParen,
  unparen,
  unbracket,
  dquote,
  unquote,
  unescape,
  paren,
  bracket,
  uriEscape,
  uriUnescape,
} = Utilities;

describe("Utilities Module", () => {
  describe("token safe", () => {
    describe("checking", () => {
      it("should return true if a string is token safe", () => {
        expect(isTokenSafe(".abc")).toBeTruthy();
      });

      it("should return false if a string is token safe", () => {
        expect(isTokenSafe("?=abc")).toBeFalsy();
      });
    });

    describe("quoting", () => {
      it("should return true if a string is token safe", () => {
        expect(quoteToken(".abc")).toBe(".abc");
      });

      it("should return false if a string is token safe", () => {
        expect(quoteToken("?=abc")).toBe('"?=abc"');
      });
    });
  });

  describe("atom safe", () => {
    describe("checking", () => {
      it("should return true if a string is token safe", () => {
        expect(isAtomSafe("?=abc")).toBeTruthy();
      });

      it("should return false if a string is token safe", () => {
        expect(isAtomSafe(".abc")).toBeFalsy();
      });
    });

    describe("quoting", () => {
      it("should return true if a string is token safe", () => {
        expect(quoteAtom("?=abc")).toBe("?=abc");
      });

      it("should return false if a string is token safe", () => {
        expect(quoteAtom(".abc")).toBe('".abc"');
      });
    });
  });

  describe("quoting phrases", () => {
    it("doesn't mutate original string", () => {
      const inputStr = Object.freeze("blargh");
      expect(() => quotePhrase(inputStr)).not.toThrow();
    });

    describe("given a non-unsafe string", () => {
      // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either" — the assertion is on `String#encoding`.
      it.skip("should not change the encoding", () => {
        expect(quotePhrase("blargh")).toBe("blargh");
      });
    });

    describe("given an unsafe string", () => {
      // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either" — the assertion is on `String#encoding`.
      it.skip("should not change the encoding", () => {
        expect(quotePhrase("Bjørn")).toBe('"Bjørn"');
      });
    });
  });

  describe("escaping parenthesies", () => {
    it("should escape parens", () => {
      const test = "This is not (escaped)";
      const result = String.raw`This is not \(escaped\)`;
      expect(escapeParen(test)).toBe(result);
    });

    it("should not double escape parens", () => {
      const test = String.raw`This is not \(escaped\)`;
      const result = String.raw`This is not \(escaped\)`;
      expect(escapeParen(test)).toBe(result);
    });

    it("should escape all parens", () => {
      const test = String.raw`This is not \()escaped(\)`;
      const result = String.raw`This is not \(\)escaped\(\)`;
      expect(escapeParen(test)).toBe(result);
    });
  });

  describe("unescaping parenthesis", () => {
    it("should work", () => {
      expect(unparen("(This is a string)")).toBe("This is a string");
    });

    it("should work without parens", () => {
      expect(unparen("This is a string")).toBe("This is a string");
    });
  });

  describe("unescaping brackets", () => {
    it("should work", () => {
      expect(unbracket("<This is a string>")).toBe("This is a string");
    });

    it("should work without brackets", () => {
      expect(unbracket("This is a string")).toBe("This is a string");
    });
  });

  describe("quoting phrases", () => {
    it("should quote a phrase if it is unsafe", () => {
      expect(dquote("this.needs quoting")).toBe('"this.needs quoting"');
    });

    it("should properly quote a string, even if quoted but not escaped properly", () => {
      expect(dquote('"this needs "escaping"')).toBe(String.raw`"this needs \"escaping"`);
    });

    it("should quote correctly a phrase with an escaped quote in it", () => {
      expect(dquote(String.raw`this needs \"quoting`)).toBe(String.raw`"this needs \\\"quoting"`);
    });

    it("should quote correctly a phrase with an escaped backslash followed by an escaped quote in it", () => {
      expect(dquote(String.raw`this needs \\"quoting`)).toBe(
        String.raw`"this needs \\\\\"quoting"`,
      );
    });
  });

  describe("unquoting phrases", () => {
    it("should remove quotes from the edge", () => {
      expect(unquote('"This is quoted"')).toBe("This is quoted");
    });

    it("should remove backslash escaping from quotes", () => {
      expect(unquote(String.raw`"This is \"quoted\""`)).toBe('This is "quoted"');
    });

    it("should remove backslash escaping from any char", () => {
      expect(unquote(String.raw`"This is \quoted"`)).toBe("This is quoted");
    });

    it("should be able to handle unquoted strings", () => {
      expect(unquote("This is not quoted")).toBe("This is not quoted");
    });

    it("should preserve backslashes in unquoted strings", () => {
      expect(unquote(String.raw`This is not \"quoted`)).toBe(String.raw`This is not \"quoted`);
    });

    it("should be able to handle unquoted quotes", () => {
      expect(unquote('"This is "quoted"')).toBe('This is "quoted');
    });
  });

  describe("unescaping phrases", () => {
    it("should not modify a string with no backslashes", () => {
      expect(unescape("This is a string")).toBe("This is a string");
    });

    it("should not modify a quoted string with no backslashes", () => {
      expect(unescape('"This is a string"')).toBe('"This is a string"');
    });

    it("should remove backslash escaping from a string", () => {
      expect(unescape(String.raw`This is \"a string\"`)).toBe('This is "a string"');
    });

    it("should remove backslash escaping from a quoted string", () => {
      expect(unescape(String.raw`"This is \"a string\""`)).toBe('"This is "a string""');
    });
  });

  describe("parenthesizing phrases", () => {
    it("should parenthesize a phrase", () => {
      expect(paren("this.needs parenthesizing")).toBe("(this.needs parenthesizing)");
    });

    it("should properly parenthesize a string, and escape properly", () => {
      expect(paren("this needs (escaping")).toBe(String.raw`(this needs \(escaping)`);
    });

    it("should properly parenthesize a string, and escape properly (other way)", () => {
      expect(paren("this needs )escaping")).toBe(String.raw`(this needs \)escaping)`);
    });

    it("should properly parenthesize a string, even if parenthesized but not escaped properly", () => {
      expect(paren("(this needs (escaping)")).toBe(String.raw`(this needs \(escaping)`);
    });

    it("should properly parenthesize a string, even if parenthesized but not escaped properly (other way)", () => {
      expect(paren("(this needs )escaping)")).toBe(String.raw`(this needs \)escaping)`);
    });

    it("should parenthesize correctly a phrase with an escaped parentheses in it", () => {
      expect(paren(String.raw`this needs \(parenthesizing`)).toBe(
        String.raw`(this needs \(parenthesizing)`,
      );
    });

    it("should parenthesize correctly a phrase with an escaped parentheses in it (other way)", () => {
      expect(paren(String.raw`this needs \)parenthesizing`)).toBe(
        String.raw`(this needs \)parenthesizing)`,
      );
    });

    it("should parenthesize correctly a phrase with an escaped backslash followed by an escaped parentheses in it", () => {
      expect(paren(String.raw`this needs \\(parenthesizing`)).toBe(
        String.raw`(this needs \\(parenthesizing)`,
      );
    });

    it("should parenthesize correctly a phrase with an escaped backslash followed by an escaped parentheses in it (other way)", () => {
      expect(paren(String.raw`this needs \\)parenthesizing`)).toBe(
        String.raw`(this needs \\)parenthesizing)`,
      );
    });

    it("should parenthesize correctly a phrase with a set of parentheses", () => {
      expect(paren("this (needs) parenthesizing")).toBe(
        String.raw`(this \(needs\) parenthesizing)`,
      );
    });
  });

  describe("bracketizing phrases", () => {
    it("should bracketize a phrase", () => {
      expect(bracket("this.needs bracketizing")).toBe("<this.needs bracketizing>");
    });

    it("should properly bracketize a string, and escape properly", () => {
      expect(bracket("this needs <escaping")).toBe(String.raw`<this needs \<escaping>`);
    });

    it("should properly bracketize a string, and escape properly (other way)", () => {
      expect(bracket("this needs >escaping")).toBe(String.raw`<this needs \>escaping>`);
    });

    it("should properly bracketize a string, even if bracketized but not escaped properly", () => {
      expect(bracket("<this needs <escaping>")).toBe(String.raw`<this needs \<escaping>`);
    });

    it("should properly bracketize a string, even if bracketized but not escaped properly (other way)", () => {
      expect(bracket("<this needs >escaping>")).toBe(String.raw`<this needs \>escaping>`);
    });

    it("should bracketize correctly a phrase with an escaped brackets in it", () => {
      expect(bracket(String.raw`this needs \<bracketizing`)).toBe(
        String.raw`<this needs \<bracketizing>`,
      );
    });

    it("should bracketize correctly a phrase with an escaped brackets in it (other way)", () => {
      expect(bracket(String.raw`this needs \>bracketizing`)).toBe(
        String.raw`<this needs \>bracketizing>`,
      );
    });

    it("should bracketize correctly a phrase with an escaped backslash followed by an escaped brackets in it", () => {
      expect(bracket(String.raw`this needs \\<bracketizing`)).toBe(
        String.raw`<this needs \\<bracketizing>`,
      );
    });

    it("should bracketize correctly a phrase with an escaped backslash followed by an escaped brackets in it (other way)", () => {
      expect(bracket(String.raw`this needs \\>bracketizing`)).toBe(
        String.raw`<this needs \\>bracketizing>`,
      );
    });

    it("should bracketize correctly a phrase with a set of brackets", () => {
      expect(bracket("this <needs> bracketizing")).toBe(String.raw`<this \<needs\> bracketizing>`);
    });
  });

  describe("url escaping", () => {
    const uriParser = Utilities.uriParser();

    it("should have a wrapper on URI.escape", () => {
      expect(uriEscape("@?@!")).toBe(uriParser.escape("@?@!"));
    });

    it("should have a wrapper on URI.unescape", () => {
      expect(uriUnescape("@?@!")).toBe(uriParser.unescape("@?@!"));
    });
  });

  describe("blank method", () => {
    it("should say nil is blank", () => {
      expect(Utilities.isBlank(null)).toBeTruthy();
    });

    it("should say false is blank", () => {
      expect(Utilities.isBlank(false)).toBeTruthy();
    });

    it("should say true is not blank", () => {
      expect(Utilities.isBlank(true)).toBeFalsy();
    });

    it("should say an empty array is blank", () => {
      expect(Utilities.isBlank([])).toBeTruthy();
    });

    it("should say an empty hash is blank", () => {
      expect(Utilities.isBlank({})).toBeTruthy();
    });

    it("should say an empty string is blank", () => {
      expect(Utilities.isBlank("")).toBeTruthy();
      expect(Utilities.isBlank(" ")).toBeTruthy();
      const a = " ".repeat(1000);
      expect(Utilities.isBlank(a)).toBeTruthy();
      expect(Utilities.isBlank("\t \n\n")).toBeTruthy();
    });
  });

  describe("not blank method", () => {
    it("should say a number is not blank", () => {
      expect(Utilities.isBlank(1)).toBeFalsy();
    });

    it("should say a valueless hash is not blank", () => {
      expect(Utilities.isBlank({ one: null, two: null })).toBeFalsy();
    });

    it("should say a hash containing an empty hash is not blank", () => {
      expect(Utilities.isBlank({ key: {} })).toBeFalsy();
    });
  });

  describe("to_lf", () => {
    it("converts single CR", () => {
      expect(Utilities.toLf("\r")).toBe("\n");
    });

    it("converts multiple CR", () => {
      expect(Utilities.toLf("\r\r")).toBe("\n\n");
    });

    it("converts single CRLF", () => {
      expect(Utilities.toLf("\r\n")).toBe("\n");
    });

    it("converts multiple CRLF", () => {
      expect(Utilities.toLf("\r\n\r\n")).toBe("\n\n");
    });

    it("leaves LF intact", () => {
      expect(Utilities.toLf("\n\n")).toBe("\n\n");
    });

    it("converts mixed line endings", () => {
      expect(Utilities.toLf("\r \n\r\n")).toBe("\n \n\n");
    });

    it("should handle japanese characters", () => {
      const string = "あえうえお\r\n\r\nかきくけこ\r\n\r\nさしつせそ\r\n\r\n";
      const expected = "あえうえお\n\nかきくけこ\n\nさしつせそ\n\n";
      expect(Utilities.binaryUnsafeToLf(string)).toBe(expected);
    });

    describe("on NilClass", () => {
      it("returns an empty string", () => {
        expect(Utilities.toLf(null as unknown as string)).toBe("");
      });
    });
  });

  describe("to_crlf", () => {
    it("converts single LF", () => {
      expect(Utilities.toCrlf("\n")).toBe("\r\n");
    });

    it("converts multiple LF", () => {
      expect(Utilities.toCrlf("\n\n")).toBe("\r\n\r\n");
    });

    it("converts single CR", () => {
      expect(Utilities.toCrlf("\r")).toBe("\r\n");
    });

    it("preserves single CRLF", () => {
      expect(Utilities.toCrlf("\r\n")).toBe("\r\n");
    });

    it("preserves multiple CRLF", () => {
      expect(Utilities.toCrlf("\r\n\r\n")).toBe("\r\n\r\n");
    });

    it("converts mixed line endings", () => {
      expect(Utilities.toCrlf("\r \n\r\n")).toBe("\r\n \r\n\r\n");
    });

    it("should handle japanese characters", () => {
      const string = "あえうえお\r\n\r\nかきくけこ\r\n\r\nさしつせそ\r\n\r\n";
      expect(Utilities.binaryUnsafeToCrlf(string)).toBe(string);
    });

    describe("on NilClass", () => {
      it("returns an empty string", () => {
        expect(Utilities.toCrlf(null as unknown as string)).toBe("");
      });
    });
  });

  describe(".decode_base64", () => {
    it("handles unpadded base64 correctly", () => {
      const decoded = Utilities.decodeBase64("YQ");
      expect(new TextDecoder().decode(decoded)).toBe("a");
    });
  });
});
