import { describe, expect, it } from "vitest";
import { ArgumentError } from "./argument-error.js";
import { Base64 } from "./base64.js";

describe("Base64", () => {
  it("encode64 breaks the line after every 60 encoded characters and at the end", () => {
    expect(Base64.encode64("lifo:world")).toBe("bGlmbzp3b3JsZA==\n");
    expect(Base64.encode64("a".repeat(50))).toBe(
      "YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFh\nYWFhYWE=\n",
    );
  });

  it("decode64 answers the bytes, one code unit per byte", () => {
    expect(Base64.decode64("dXNlcjpwYXNz")).toBe("user:pass");
    expect(Base64.decode64("AH+A/w==")).toBe("\x00\x7f\x80\xff");
    expect(Base64.decode64("w6k=")).toBe("\xc3\xa9");
    expect(Base64.decode64("")).toBe("");
  });

  it("decode64 skips characters outside the alphabet", () => {
    expect(Base64.decode64("dXNl\ncjpw YXNz")).toBe("user:pass");
  });

  it("decode64 stops at padding and keeps a short tail", () => {
    expect(Base64.decode64("dXNlcg==cjpw")).toBe("user");
    expect(Base64.decode64("dXN")).toBe("us");
  });

  it("decode64 round-trips strictEncode64", () => {
    expect(Base64.decode64(Base64.strictEncode64("\x80\xff:ok"))).toBe("\x80\xff:ok");
  });

  it("strict_decode64 decodes padded input and raises ArgumentError for malformed input", () => {
    expect(Base64.strictDecode64("dXNlcjpwYXNz")).toBe("user:pass");
    expect(Base64.strictDecode64("AH+A/w==")).toBe("\x00\x7f\x80\xff");
    expect(Base64.strictDecode64("w6k=")).toBe("\xc3\xa9");
    expect(Base64.strictDecode64("")).toBe("");
    for (const bad of ["=", "abc==", "a", "ab", "abc", "ab=c", "a===", "w6l=", "AB==", "a b="]) {
      expect(() => Base64.strictDecode64(bad)).toThrow(ArgumentError);
    }
  });

  it("urlsafe_encode64 maps the URL-safe alphabet and drops padding on request", () => {
    expect(Base64.urlsafeEncode64("\xfb\xef\xbe")).toBe("----");
    expect(Base64.urlsafeEncode64("\xff\xff\xff")).toBe("____");
    expect(Base64.urlsafeEncode64("*")).toBe("Kg==");
    expect(Base64.urlsafeEncode64("*", { padding: false })).toBe("Kg");
    expect(Base64.urlsafeEncode64("12345", { padding: false })).toBe("MTIzNDU");
    expect(Base64.urlsafeEncode64("123", { padding: false })).toBe("MTIz");
    expect(Base64.urlsafeEncode64("12345")).toBe("MTIzNDU=");
    expect(Base64.urlsafeEncode64("\x00\x7f\x80\xff")).toBe("AH-A_w==");
    expect(Base64.urlsafeEncode64("\x00\x7f\x80\xff", { padding: false })).toBe("AH-A_w");
    expect(Base64.urlsafeEncode64("\x80\xff\xfe\xfd\xfc", { padding: false })).toBe("gP_-_fw");
  });

  it("urlsafe_decode64 pads unpadded input and maps the URL-safe alphabet", () => {
    expect(Base64.urlsafeDecode64("AH-A_w")).toBe("\x00\x7f\x80\xff");
    expect(Base64.urlsafeDecode64("AH-A_w==")).toBe("\x00\x7f\x80\xff");
    expect(Base64.urlsafeDecode64("w6k")).toBe("\xc3\xa9");
    for (const bad of ["=", "abc==", "a", "!!!!"]) {
      expect(() => Base64.urlsafeDecode64(bad)).toThrow(ArgumentError);
    }
  });
});
