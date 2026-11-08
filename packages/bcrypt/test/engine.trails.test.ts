import { describe, expect, it, vi } from "vitest";
import bcryptjs from "bcryptjs";
import { Range } from "@blazetrails/ruby-compat";
import { Engine, Password } from "../lib/index.js";

describe("BCrypt::Engine", () => {
  it("hash_secret answers what bcryptjs answers on every backend", () => {
    const secrets = [
      "",
      "pw",
      "a".repeat(71),
      "a".repeat(72),
      "a".repeat(600),
      "é".repeat(36),
      "𐐷".repeat(256),
    ];
    const salts = [
      "$2a$04$abcdefghijklmnopqrstuu",
      "$2b$04$abcdefghijklmnopqrstuu",
      "$2y$04$abcdefghijklmnopqrstuu",
      bcryptjs.hashSync("pw", "$2a$04$abcdefghijklmnopqrstuu"),
    ];
    for (const secret of secrets) {
      for (const salt of salts) {
        expect(Engine.hashSecret(secret, salt)).toBe(bcryptjs.hashSync(secret, salt));
      }
    }
  });

  it("hash_secret raises where bcryptjs raises on an unhashable salt", () => {
    for (const salt of [
      "$2z$04$abcdefghijklmnopqrstuu",
      "$2a$03$abcdefghijklmnopqrstuu",
      "$2a$32$abcdefghijklmnopqrstuu",
    ]) {
      expect(() => bcryptjs.hashSync("pw", salt)).toThrow();
      expect(() => Engine.hashSecret("pw", salt)).toThrow();
    }
  });

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
