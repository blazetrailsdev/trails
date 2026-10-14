import { describe, expect, it, vi } from "vitest";
import { Range } from "@blazetrails/ruby-compat";
import { Engine, Password } from "./index.js";

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

  it("generate_salt answers nil above MAX_COST", () => {
    expect(Engine.generateSalt(Engine.MAX_COST)).toMatch(/^\$2a\$31\$[A-Za-z0-9./]{22}$/);
    expect(Engine.generateSalt(32)).toBeNull();
  });

  it("calibrate answers the Range it ran over when no cost exceeds the limit", () => {
    const create = vi.spyOn(Password, "create").mockReturnValue(null as never);
    try {
      const costs = Engine.calibrate(Infinity);
      expect(costs).toBeInstanceOf(Range);
      expect((costs as Range<number>).equals(new Range(Engine.MIN_COST, 30))).toBe(true);
      expect(create).toHaveBeenCalledTimes(27);
    } finally {
      create.mockRestore();
    }
  });
});
