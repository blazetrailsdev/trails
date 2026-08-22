import { describe, it, expect } from "vitest";
import { Key } from "./key.js";
import { Configurable } from "./configurable.js";
import type { KeyGenerator } from "./key-generator.js";

describe("ActiveRecord::Encryption::KeyTest", () => {
  it("A key can store a secret and public tags", () => {
    const key = new Key("the secret");
    key.publicTags.set("key", "the key reference");
    expect(key.secret).toBe("the secret");
    expect(key.publicTags.get("key")).toBe("the key reference");
  });

  it(".derive_from instantiates a key with its secret derived from the passed password", () => {
    expect((Configurable.keyGenerator as KeyGenerator).deriveKeyFrom("some password")).toEqual(
      Key.deriveFrom("some password").secret,
    );
  });
});
