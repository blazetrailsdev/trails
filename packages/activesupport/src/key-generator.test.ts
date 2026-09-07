import { describe, it, expect, beforeEach } from "vitest";
import { KeyGenerator, CachingKeyGenerator } from "./key-generator.js";
import { getCrypto, OpenSSL } from "@blazetrails/ruby-compat";
import { ArgumentError } from "./hash-utils.js";
import { assertRaises } from "./testing/assertions.js";

describe("KeyGeneratorTest", () => {
  class InvalidDigest {}

  let secret: string;
  let generator: KeyGenerator;

  beforeEach(() => {
    secret = getCrypto().randomBytes(64).toString("hex");
    generator = new KeyGenerator(secret, { iterations: 2 });
  });

  it("Generating a key of the default length", () => {
    const derivedKey = generator.generateKey("some_salt");
    expect(derivedKey).toBeInstanceOf(Buffer);
    expect(derivedKey.length).toBe(64);
  });

  it("Generating a key of an alternative length", () => {
    const derivedKey = generator.generateKey("some_salt", 32);
    expect(derivedKey).toBeInstanceOf(Buffer);
    expect(derivedKey.length).toBe(32);
  });

  it("Expected results", () => {
    let expected =
      "b129376f68f1ecae788d7433310249d65ceec090ecacd4c872a3a9e9ec78e055739be5cc6956345d5ae38e7e1daa66f1de587dc8da2bf9e8b965af4b3918a122";
    expect(new KeyGenerator("0".repeat(64)).generateKey("some_salt").toString("hex")).toBe(
      expected,
    );

    expected = "b129376f68f1ecae788d7433310249d65ceec090ecacd4c872a3a9e9ec78e055";
    expect(new KeyGenerator("0".repeat(64)).generateKey("some_salt", 32).toString("hex")).toBe(
      expected,
    );

    expected =
      "cbea7f7f47df705967dc508f4e446fd99e7797b1d70011c6899cd39bbe62907b8508337d678505a7dc8184e037f1003ba3d19fc5d829454668e91d2518692eae";
    expect(
      new KeyGenerator("0".repeat(64), { iterations: 2 }).generateKey("some_salt").toString("hex"),
    ).toBe(expected);
  });

  it("With custom hash digest class", () => {
    const originalHashDigestClass = KeyGenerator.hashDigestClass;

    KeyGenerator.hashDigestClass = OpenSSL.Digest.SHA256;

    const expected =
      "c92322ad55ee691520e8e0f279b53e7a5cc9c1f8efca98295ae252b04cc6e2274c3aaf75ef53b260a6dc548f3e5fbb8af0edf10e7663cf7054c35bcc12835fc0";
    try {
      expect(new KeyGenerator("0".repeat(64)).generateKey("some_salt").toString("hex")).toBe(
        expected,
      );
    } finally {
      KeyGenerator.hashDigestClass = originalHashDigestClass;
    }
  });

  it("Raises if given a non digest instance", async () => {
    await assertRaises([ArgumentError], {}, () => {
      KeyGenerator.hashDigestClass = InvalidDigest as never;
    });
    await assertRaises([ArgumentError], {}, () => {
      KeyGenerator.hashDigestClass = new InvalidDigest() as never;
    });
  });

  it("inspect does not show secrets", () => {
    expect(generator.inspect()).toMatch(/^#<KeyGenerator:0x[0-9a-f]+>$/);
  });
});

describe("CachingKeyGeneratorTest", () => {
  let cachingGenerator: CachingKeyGenerator;

  beforeEach(() => {
    const secret = getCrypto().randomBytes(64).toString("hex");
    cachingGenerator = new CachingKeyGenerator(new KeyGenerator(secret, { iterations: 2 }));
  });

  it("Generating a cached key for same salt and key size", () => {
    const derivedKey = cachingGenerator.generateKey("some_salt", 32);
    const cachedKey = cachingGenerator.generateKey("some_salt", 32);

    expect(cachedKey).toEqual(derivedKey);
    expect(cachedKey).toBe(derivedKey);
  });

  it("Does not cache key for different salt", () => {
    const derivedKey = cachingGenerator.generateKey("some_salt", 32);
    const differentSaltKey = cachingGenerator.generateKey("other_salt", 32);

    expect(differentSaltKey).not.toEqual(derivedKey);
  });

  it("Does not cache key for different length", () => {
    const derivedKey = cachingGenerator.generateKey("some_salt", 32);
    const differentLengthKey = cachingGenerator.generateKey("some_salt", 64);

    expect(differentLengthKey).not.toEqual(derivedKey);
  });

  it("Does not cache key for different salts and lengths that are different but are equal when concatenated", () => {
    const derivedKey = cachingGenerator.generateKey("13", 37);
    const differentLengthKey = cachingGenerator.generateKey("1", 337);

    expect(differentLengthKey).not.toEqual(derivedKey);
  });
});
