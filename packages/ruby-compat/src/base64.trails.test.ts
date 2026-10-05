import { describe, expect, it } from "vitest";
import { Base64 } from "./base64.js";

describe("Base64", () => {
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
});
