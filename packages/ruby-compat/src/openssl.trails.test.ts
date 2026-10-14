import { describe, expect, it } from "vitest";

import { Digest } from "./digest.js";
import { OpenSSL } from "./openssl.js";

describe("OpenSSL::Digest", () => {
  it("seats constants distinct from Digest's, each named by its own path", () => {
    for (const algorithm of ["MD5", "SHA1", "SHA256"] as const) {
      expect(OpenSSL.Digest[algorithm]).not.toBe(Digest[algorithm]);
      expect(OpenSSL.Digest[algorithm].name).toBe(`OpenSSL::Digest::${algorithm}`);
      expect(OpenSSL.Digest[algorithm].hexdigest("abc")).toBe(Digest[algorithm].hexdigest("abc"));
    }
  });

  it("OpenSSL::Random.random_bytes answers that many bytes, different each call", () => {
    const bytes = OpenSSL.Random.randomBytes(16);
    expect(bytes.length).toBe(16);
    expect(OpenSSL.Random.randomBytes(16).toString("hex")).not.toBe(bytes.toString("hex"));
  });
});
