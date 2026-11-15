import "@blazetrails/vitest-matchers";
import { describe, expect, it } from "vitest";
import { include } from "@blazetrails/ruby-compat";
import { Multibyte } from "../lib/multibyte.js";
import { Utilities } from "../lib/utilities.js";

const mbChars = (str: string): string => Multibyte.mbChars(str) as string;

class UtilitiesSpec {}
include(UtilitiesSpec, Utilities);
const self = new UtilitiesSpec() as Utilities;

describe("Utilities Module", () => {
  describe("token safe", () => {
    describe("checking", () => {
      it("should return true if a string is token safe", () => {
        expect(self.isTokenSafe(".abc")).toBeTruthy();
      });

      it("should return false if a string is token safe", () => {
        expect(self.isTokenSafe("?=abc")).toBeFalsy();
      });

      it("should work with mb_chars", () => {
        expect(self.isTokenSafe(mbChars(".abc"))).toBeTruthy();
        expect(self.isTokenSafe(mbChars("?=abc"))).toBeFalsy();
      });
    });

    describe("quoting", () => {
      it("should return true if a string is token safe", () => {
        expect(self.quoteToken(".abc")).toBe(".abc");
      });

      it("should return false if a string is token safe", () => {
        expect(self.quoteToken("?=abc")).toBe('"?=abc"');
      });

      it("should work with mb_chars", () => {
        expect(String(self.quoteToken(mbChars(".abc")))).toBe(".abc");
        expect(self.quoteToken(mbChars("?=abc"))).toBe('"?=abc"');
      });
    });
  });

  describe("atom safe", () => {
    describe("checking", () => {
      it("should return true if a string is token safe", () => {
        expect(self.isAtomSafe("?=abc")).toBeTruthy();
      });

      it("should return false if a string is token safe", () => {
        expect(self.isAtomSafe(".abc")).toBeFalsy();
      });

      it("should work with mb_chars", () => {
        expect(self.isAtomSafe(mbChars("?=abc"))).toBeTruthy();
        expect(self.isAtomSafe(mbChars(".abc"))).toBeFalsy();
      });
    });

    describe("quoting", () => {
      it("should return true if a string is token safe", () => {
        expect(self.quoteAtom("?=abc")).toBe("?=abc");
      });

      it("should return false if a string is token safe", () => {
        expect(self.quoteAtom(".abc")).toBe('".abc"');
      });

      it("should work with mb_chars", () => {
        expect(String(self.quoteAtom(mbChars("?=abc")))).toBe("?=abc");
        expect(self.quoteAtom(mbChars(".abc"))).toBe('".abc"');
      });

      it("should quote mb_chars white space", () => {
        expect(self.quoteAtom(mbChars("ab abc"))).toBe('"ab abc"');
        expect(self.quoteAtom(mbChars("a b\ta\r\nbc"))).toBe('"a b\ta\r\nbc"');
      });
    });
  });

  describe("quoting phrases", () => {
    it("doesn't mutate original string", () => {
      const inputStr = Object.freeze("blargh");
      expect(() => self.quotePhrase(inputStr)).not.toThrow();
    });

    describe("given a non-unsafe string", () => {
      // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either" — the assertion is on `String#encoding`.
      it.skip("should not change the encoding", () => {
        expect(self.quotePhrase("blargh")).toBe("blargh");
      });
    });

    describe("given an unsafe string", () => {
      // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either" — the assertion is on `String#encoding`.
      it.skip("should not change the encoding", () => {
        expect(self.quotePhrase("Bjørn")).toBe('"Bjørn"');
      });
    });
  });

  describe("escaping parenthesies", () => {
    it("should escape parens", () => {
      const test = "This is not (escaped)";
      const result = String.raw`This is not \(escaped\)`;
      expect(self.escapeParen(test)).toBe(result);
    });

    it("should not double escape parens", () => {
      const test = String.raw`This is not \(escaped\)`;
      const result = String.raw`This is not \(escaped\)`;
      expect(self.escapeParen(test)).toBe(result);
    });

    it("should escape all parens", () => {
      const test = String.raw`This is not \()escaped(\)`;
      const result = String.raw`This is not \(\)escaped\(\)`;
      expect(self.escapeParen(test)).toBe(result);
    });
  });

  describe("unescaping parenthesis", () => {
    it("should work", () => {
      expect(self.unparen("(This is a string)")).toBe("This is a string");
    });

    it("should work without parens", () => {
      expect(self.unparen("This is a string")).toBe("This is a string");
    });

    it("should work using Multibyte.mb_chars", () => {
      const test = mbChars("(This is a string)");
      const result = "This is a string";
      expect(String(self.unparen(test))).toBe(result);
    });

    it("should work without parens using Multibyte.mb_chars", () => {
      const test = mbChars("This is a string");
      const result = "This is a string";
      expect(String(self.unparen(test))).toBe(result);
    });
  });

  describe("unescaping brackets", () => {
    it("should work", () => {
      expect(self.unbracket("<This is a string>")).toBe("This is a string");
    });

    it("should work without brackets", () => {
      expect(self.unbracket("This is a string")).toBe("This is a string");
    });

    it("should work using Multibyte.mb_chars", () => {
      const test = mbChars("<This is a string>");
      const result = "This is a string";
      expect(String(self.unbracket(test))).toBe(result);
    });

    it("should work without parens using Multibyte.mb_chars", () => {
      const test = mbChars("This is a string");
      const result = "This is a string";
      expect(String(self.unbracket(test))).toBe(result);
    });
  });

  describe("quoting phrases", () => {
    it("should quote a phrase if it is unsafe", () => {
      expect(self.dquote("this.needs quoting")).toBe('"this.needs quoting"');
    });

    it("should properly quote a string, even if quoted but not escaped properly", () => {
      expect(self.dquote('"this needs "escaping"')).toBe(String.raw`"this needs \"escaping"`);
    });

    it("should quote correctly a phrase with an escaped quote in it", () => {
      expect(self.dquote(String.raw`this needs \"quoting`)).toBe(
        String.raw`"this needs \\\"quoting"`,
      );
    });

    it("should quote correctly a phrase with an escaped backslash followed by an escaped quote in it", () => {
      expect(self.dquote(String.raw`this needs \\"quoting`)).toBe(
        String.raw`"this needs \\\\\"quoting"`,
      );
    });
  });

  describe("unquoting phrases", () => {
    it("should remove quotes from the edge", () => {
      expect(self.unquote('"This is quoted"')).toBe("This is quoted");
    });

    it("should remove backslash escaping from quotes", () => {
      expect(self.unquote(String.raw`"This is \"quoted\""`)).toBe('This is "quoted"');
    });

    it("should remove backslash escaping from any char", () => {
      expect(self.unquote(String.raw`"This is \quoted"`)).toBe("This is quoted");
    });

    it("should be able to handle unquoted strings", () => {
      expect(self.unquote("This is not quoted")).toBe("This is not quoted");
    });

    it("should preserve backslashes in unquoted strings", () => {
      expect(self.unquote(String.raw`This is not \"quoted`)).toBe(String.raw`This is not \"quoted`);
    });

    it("should be able to handle unquoted quotes", () => {
      expect(self.unquote('"This is "quoted"')).toBe('This is "quoted');
    });
  });

  describe("unescaping phrases", () => {
    it("should not modify a string with no backslashes", () => {
      expect(self.unescape("This is a string")).toBe("This is a string");
    });

    it("should not modify a quoted string with no backslashes", () => {
      expect(self.unescape('"This is a string"')).toBe('"This is a string"');
    });

    it("should remove backslash escaping from a string", () => {
      expect(self.unescape(String.raw`This is \"a string\"`)).toBe('This is "a string"');
    });

    it("should remove backslash escaping from a quoted string", () => {
      expect(self.unescape(String.raw`"This is \"a string\""`)).toBe('"This is "a string""');
    });
  });

  describe("parenthesizing phrases", () => {
    it("should parenthesize a phrase", () => {
      expect(self.paren("this.needs parenthesizing")).toBe("(this.needs parenthesizing)");
    });

    it("should properly parenthesize a string, and escape properly", () => {
      expect(self.paren("this needs (escaping")).toBe(String.raw`(this needs \(escaping)`);
    });

    it("should properly parenthesize a string, and escape properly (other way)", () => {
      expect(self.paren("this needs )escaping")).toBe(String.raw`(this needs \)escaping)`);
    });

    it("should properly parenthesize a string, even if parenthesized but not escaped properly", () => {
      expect(self.paren("(this needs (escaping)")).toBe(String.raw`(this needs \(escaping)`);
    });

    it("should properly parenthesize a string, even if parenthesized but not escaped properly (other way)", () => {
      expect(self.paren("(this needs )escaping)")).toBe(String.raw`(this needs \)escaping)`);
    });

    it("should parenthesize correctly a phrase with an escaped parentheses in it", () => {
      expect(self.paren(String.raw`this needs \(parenthesizing`)).toBe(
        String.raw`(this needs \(parenthesizing)`,
      );
    });

    it("should parenthesize correctly a phrase with an escaped parentheses in it (other way)", () => {
      expect(self.paren(String.raw`this needs \)parenthesizing`)).toBe(
        String.raw`(this needs \)parenthesizing)`,
      );
    });

    it("should parenthesize correctly a phrase with an escaped backslash followed by an escaped parentheses in it", () => {
      expect(self.paren(String.raw`this needs \\(parenthesizing`)).toBe(
        String.raw`(this needs \\(parenthesizing)`,
      );
    });

    it("should parenthesize correctly a phrase with an escaped backslash followed by an escaped parentheses in it (other way)", () => {
      expect(self.paren(String.raw`this needs \\)parenthesizing`)).toBe(
        String.raw`(this needs \\)parenthesizing)`,
      );
    });

    it("should parenthesize correctly a phrase with a set of parentheses", () => {
      expect(self.paren("this (needs) parenthesizing")).toBe(
        String.raw`(this \(needs\) parenthesizing)`,
      );
    });
  });

  describe("bracketizing phrases", () => {
    it("should bracketize a phrase", () => {
      expect(self.bracket("this.needs bracketizing")).toBe("<this.needs bracketizing>");
    });

    it("should properly bracketize a string, and escape properly", () => {
      expect(self.bracket("this needs <escaping")).toBe(String.raw`<this needs \<escaping>`);
    });

    it("should properly bracketize a string, and escape properly (other way)", () => {
      expect(self.bracket("this needs >escaping")).toBe(String.raw`<this needs \>escaping>`);
    });

    it("should properly bracketize a string, even if bracketized but not escaped properly", () => {
      expect(self.bracket("<this needs <escaping>")).toBe(String.raw`<this needs \<escaping>`);
    });

    it("should properly bracketize a string, even if bracketized but not escaped properly (other way)", () => {
      expect(self.bracket("<this needs >escaping>")).toBe(String.raw`<this needs \>escaping>`);
    });

    it("should bracketize correctly a phrase with an escaped brackets in it", () => {
      expect(self.bracket(String.raw`this needs \<bracketizing`)).toBe(
        String.raw`<this needs \<bracketizing>`,
      );
    });

    it("should bracketize correctly a phrase with an escaped brackets in it (other way)", () => {
      expect(self.bracket(String.raw`this needs \>bracketizing`)).toBe(
        String.raw`<this needs \>bracketizing>`,
      );
    });

    it("should bracketize correctly a phrase with an escaped backslash followed by an escaped brackets in it", () => {
      expect(self.bracket(String.raw`this needs \\<bracketizing`)).toBe(
        String.raw`<this needs \\<bracketizing>`,
      );
    });

    it("should bracketize correctly a phrase with an escaped backslash followed by an escaped brackets in it (other way)", () => {
      expect(self.bracket(String.raw`this needs \\>bracketizing`)).toBe(
        String.raw`<this needs \\>bracketizing>`,
      );
    });

    it("should bracketize correctly a phrase with a set of brackets", () => {
      expect(self.bracket("this <needs> bracketizing")).toBe(
        String.raw`<this \<needs\> bracketizing>`,
      );
    });
  });

  describe("url escaping", () => {
    const uriParser = Utilities.uriParser();

    it("should have a wrapper on URI.escape", () => {
      expect(self.uriEscape("@?@!")).toBe(uriParser.escape("@?@!"));
    });

    it("should have a wrapper on URI.unescape", () => {
      expect(self.uriUnescape("@?@!")).toBe(uriParser.unescape("@?@!"));
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

    describe("on String subclasses", () => {
      it("returns Strings", () => {
        const klass = class extends String {};
        const string = new klass("") as unknown as string;
        expect(Utilities.toLf(string)).toBeExactInstanceOf(String);
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

    describe("on String subclasses", () => {
      it("returns Strings", () => {
        const klass = class extends String {};
        const string = new klass("") as unknown as string;
        expect(Utilities.toCrlf(string)).toBeExactInstanceOf(String);
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
