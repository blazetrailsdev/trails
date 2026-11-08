import type {} from "@blazetrails/vitest-matchers";
import { describe, expect, it } from "vitest";
import { Base64 } from "./base64.js";

describe("Mail::Encodings::Base64", () => {
  it("should encode base 64 from text", () => {
    const result = "VGhpcyBpcyBhIHRlc3Q=\r\n";
    expect(Base64.encode("This is a test")).toEqual(result);
  });

  it("should decode base 64 text", () => {
    const result = "This is a test";
    expect(Base64.decode("VGhpcyBpcyBhIHRlc3Q=\n")).toEqualRuby(result);
  });

  it("should encode base 64 from binary", () => {
    const result = "AAAAAA==\r\n";
    expect(Base64.encode("\x00\x00\x00\x00")).toEqual(result);
  });

  it("should decode base 64 text", () => {
    const result = "\x00\x00\x00\x00";
    expect(Base64.decode("AAAAAA==\n")).toEqualRuby(result);
  });
});
