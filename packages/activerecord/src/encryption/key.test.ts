import { describe, it, expect } from "vitest";
import { Key } from "./key.js";

describe("ActiveRecord::Encryption::KeyTest", () => {
  it("A key can store a secret and public tags", () => {
    const key = new Key("the secret");
    key.publicTags.set("key", "the key reference");
    expect(key.secret).toBe("the secret");
    expect(key.publicTags.get("key")).toBe("the key reference");
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
