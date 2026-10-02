import { describe, expect, it } from "vitest";
import { Engine } from "./index.js";

describe("BCrypt::Engine", () => {
  it("hash_secret truncates at the 72nd byte inside a multi-byte character", () => {
    const salt = "$2a$04$abcdefghijklmnopqrstuu";
    const vectors = [
      ["b".repeat(71) + "é", "5J3F48rQwn5GXtK6/3nKqkSHRd1U0zi"],
      ["b".repeat(70) + "€", "QZTT1vsEC2uV3YWIKha5LoPhhtbyrVO"],
      ["b".repeat(69) + "𐐷x", "D9D5RXfH6S1rn9JfBsUjcWVWhLfVumC"],
    ];
    for (const [secret, checksum] of vectors) {
      expect(Engine.hashSecret(secret, salt)).toBe(salt + checksum);
    }
  });
});
