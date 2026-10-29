import type {} from "@blazetrails/vitest-matchers";
import { b } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { QuotedPrintable } from "./quoted-printable.js";

describe("Mail::Encodings::QuotedPrintable", () => {
  it("should encode quoted printable from text", () => {
    const result = "This is\r\na test=\r\n";
    expect(QuotedPrintable.encode("This is\na test")).toEqual(result);
  });

  it("should encode quoted printable from crlf text", () => {
    const result = "This is\r\na test=\r\n";
    expect(QuotedPrintable.encode("This is\r\na test")).toEqual(result);
  });

  it("should encode quoted printable from cr text", () => {
    const result = "This is\r\na test=\r\n";
    expect(QuotedPrintable.encode("This is\ra test")).toEqual(result);
  });

  it("should bypass line ending conversion for binary encoding", () => {
    const text = b("test \r \u{1F37F}");
    expect(QuotedPrintable.encode(text)).toEqual("test =0D =F0=9F=8D=BF=\r\n");
  });

  it("should decode quoted printable", () => {
    const result = "This is\na test";
    expect(QuotedPrintable.decode("This is\r\na test")).toEqualRuby(result);
  });

  it("should encode quoted printable from binary", () => {
    const text = b("\x00\x00\r\u{1F60A}\n\x00\x00");
    expect(QuotedPrintable.encode(text)).toEqual("=00=00=0D=F0=9F=98=8A\r\n=00=00=\r\n");
  });

  it("should decode quoted printable text", () => {
    const result = "\x00\x00\n\x00\x00";
    expect(QuotedPrintable.decode("=00=00=0D=0A=00=00")).toEqualRuby(result);
  });

  it("should bypass line ending conversion for binary decoding", () => {
    const result = b("test \r \u{1F37F}");
    expect(QuotedPrintable.decode("test =0D =F0=9F=8D=BF=\n")).toEqualRuby(result);
  });

  for (const [, linebreak] of [
    ["\r", "=0D"],
    ["\n", "=0A"],
    ["\r\n", "=0D=0A"],
  ]) {
    const expected = "first line wraps\n\nsecond paragraph";

    it(`should cope with inappropriate ${linebreak} line break encoding`, () => {
      const body = `first line=\r\n wraps${linebreak}\r\n${linebreak}\r\nsecond paragraph=\r\n`;
      expect(QuotedPrintable.decode(body)).toEqualRuby(expected);
    });

    it(`should allow encoded ${linebreak} line breaks with soft line feeds`, () => {
      const body = `first line=\r\n wraps${linebreak}=\r\n${linebreak}=\r\nsecond paragraph=\r\n`;
      expect(QuotedPrintable.decode(body)).toEqualRuby(expected);
    });
  }
});
