import { describe, it, expect, afterEach } from "vitest";
import { createHash } from "crypto";
import { OpenSSL } from "@blazetrails/ruby-compat";
import { ArgumentError } from "./hash-utils.js";
import { Digest } from "./digest.js";

describe("DigestTest", () => {
  class InvalidDigest {}

  afterEach(() => {
    Digest.hashDigestClass = OpenSSL.Digest.MD5;
  });

  it("with default hash digest class", () => {
    const raw = createHash("md5").update("hello").digest("hex");
    expect(Digest.hexdigest("hello")).toBe(raw.slice(0, 32));
  });

  it("with custom hash digest class", () => {
    Digest.hashDigestClass = OpenSSL.Digest.SHA1;
    const digest = Digest.hexdigest("hello friend");

    expect(digest.length).toBe(32);
    expect(createHash("sha1").update("hello friend").digest("hex").slice(0, 32)).toBe(digest);
  });

  it("should raise argument error if custom digest is missing hexdigest method", () => {
    expect(() => {
      Digest.hashDigestClass = InvalidDigest as never;
    }).toThrow(ArgumentError);
  });
});
