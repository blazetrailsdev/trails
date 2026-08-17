import { describe, it, expect, afterEach } from "vitest";
import { createHash } from "crypto";
import { Digest } from "./digest.js";

describe("DigestTest", () => {
  afterEach(() => {
    Digest.hashDigestClass = {
      hexdigest(data: string) {
        return createHash("md5").update(data).digest("hex");
      },
    };
  });

  it("with default hash digest class", () => {
    const raw = createHash("md5").update("hello").digest("hex");
    expect(Digest.hexdigest("hello")).toBe(raw.slice(0, 32));
  });

  it("with custom hash digest class", () => {
    const sha1Class = {
      hexdigest(data: string) {
        return createHash("sha1").update(data).digest("hex");
      },
    };
    Digest.hashDigestClass = sha1Class;
    const digest = Digest.hexdigest("hello friend");

    expect(digest.length).toBe(32);
    expect(createHash("sha1").update("hello friend").digest("hex").slice(0, 32)).toBe(digest);
  });

  it("should raise argument error if custom digest is missing hexdigest method", () => {
    expect(() => {
      Digest.hashDigestClass = {} as any;
    }).toThrow("is expected to implement hexdigest class method");
  });
});
