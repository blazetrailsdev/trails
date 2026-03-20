import { describe, it, expect } from "vitest";
import { Scheme } from "./scheme.js";
import { ConfigError } from "./errors.js";

describe("ActiveRecord::Encryption::SchemeTest", () => {
  it("validates config options when using encrypted attributes", () => {
    expect(() => new Scheme({ ignoreCase: true, deterministic: false })).toThrow(ConfigError);
    expect(() => new Scheme({ downcase: true, deterministic: false })).toThrow(ConfigError);
  });

  it("should create a encryptor well when compressor is given", () => {
    const customCompressor = {
      deflate: (data: string) => Buffer.from(data),
      inflate: (data: Buffer | Uint8Array) => Buffer.from(data).toString("utf-8"),
    };
    const scheme = new Scheme({ compressor: customCompressor });
    expect(scheme.encryptor).toBeTruthy();
  });

  it("should create a encryptor well when compress is false", () => {
    const scheme = new Scheme({ compress: false });
    expect(scheme.encryptor).toBeTruthy();
  });
});
