import { describe, it, expect } from "vitest";
import { Key } from "./key.js";

describe("ActiveRecord::Encryption::KeyTest", () => {
  it("A key can store a secret and public tags", () => {
    const key = new Key("my-secret");
    key.publicTags = { keyId: "abc" };
    expect(key.secret).toBe("my-secret");
    expect(key.publicTags).toEqual({ keyId: "abc" });
  });

  it(".derive_from instantiates a key with its secret derived from the passed password", () => {
    const key = Key.deriveFrom("my-password");
    expect(key).toBeInstanceOf(Key);
    expect(key.secret).toBeTruthy();
    expect(key.secret.length).toBeGreaterThan(0);
    const key2 = Key.deriveFrom("my-password");
    expect(key2.secret).toBe(key.secret);
  });
});
