import { describe, it, expect } from "vitest";
import { KeyGenerator } from "./key-generator.js";

describe("ActiveRecord::Encryption::KeyGeneratorTest", () => {
  it("generate_random_key generates random keys with the cipher key length by default", () => {
    const gen = new KeyGenerator();
    const key = gen.generateRandomKey();
    expect(Buffer.from(key, "base64").length).toBe(32);
  });

  it("generate_random_key generates random keys with a custom length", () => {
    const gen = new KeyGenerator();
    const key = gen.generateRandomKey(16);
    expect(Buffer.from(key, "base64").length).toBe(16);
  });

  it("generate_random_hex_key generates random hexadecimal keys with the cipher key length by default", () => {
    const gen = new KeyGenerator();
    const key = gen.generateRandomHexKey();
    expect(key.length).toBe(64);
    expect(key).toMatch(/^[0-9a-f]+$/);
  });

  it("generate_random_hex_key generates random hexadecimal keys with a custom length", () => {
    const gen = new KeyGenerator();
    const key = gen.generateRandomHexKey(16);
    expect(key.length).toBe(32);
    expect(key).toMatch(/^[0-9a-f]+$/);
  });

  it("derive keys using the configured digest algorithm", () => {
    const gen256 = new KeyGenerator("SHA256");
    const genSha1 = new KeyGenerator("SHA1");
    const k1 = gen256.deriveKey("password");
    const k2 = genSha1.deriveKey("password");
    expect(k1).not.toBe(k2);
  });

  it("derive_key derives a key with from the provided password with the cipher key length by default", () => {
    const gen = new KeyGenerator();
    const key = gen.deriveKey("password");
    expect(Buffer.from(key, "base64").length).toBe(32);
    const key2 = gen.deriveKey("password");
    expect(key2).toBe(key);
  });

  it("derive_key derives a key with a custom length", () => {
    const gen = new KeyGenerator();
    const key = gen.deriveKey("password", 16);
    expect(Buffer.from(key, "base64").length).toBe(16);
  });
});
