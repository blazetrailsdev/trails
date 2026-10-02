import { beforeEach, describe, expect, it } from "vitest";
import { Engine, Errors, Password } from "./index.js";

describe("BCrypt::Engine", () => {
  describe(".calibrate(upper_time_limit_in_ms)", () => {
    describe("a tiny upper time limit provided", () => {
      it("returns a minimum cost supported by the algorithm", () => {
        expect(Engine.calibrate(0.001)).toBe(4);
      });
    });
  });
});

describe("The BCrypt engine", () => {
  it("should calculate the optimal cost factor to fit in a specific time", () => {
    const startTime = performance.now();
    Password.create("testing testing", { cost: Engine.MIN_COST + 1 });
    const minTimeMs = performance.now() - startTime;
    const first = Engine.calibrate(minTimeMs)!;
    const second = Engine.calibrate(minTimeMs * 4)!;
    expect(second).toBeGreaterThan(first);
  });
});

describe("Generating BCrypt salts", () => {
  it("should produce strings", () => {
    expect(typeof Engine.generateSalt()).toBe("string");
  });

  it("should produce random data", () => {
    expect(Engine.generateSalt()).not.toBe(Engine.generateSalt());
  });

  it("should raise a InvalidCostError if the cost parameter isn't numeric", () => {
    expect(() => Engine.generateSalt("woo" as never)).toThrow(Errors.InvalidCost);
  });

  it("should raise a InvalidCostError if the cost parameter isn't greater than 0", () => {
    expect(() => Engine.generateSalt(-1)).toThrow(Errors.InvalidCost);
  });
});

describe("Autodetecting of salt cost", () => {
  it("should work", () => {
    expect(Engine.autodetectCost("$2a$08$hRx2IVeHNsTSYYtUWn61Ou")).toBe(8);
    expect(Engine.autodetectCost("$2a$05$XKd1bMnLgUnc87qvbAaCUu")).toBe(5);
    expect(Engine.autodetectCost("$2a$13$Lni.CZ6z5A7344POTFBBV.")).toBe(13);
  });
});

describe("Generating BCrypt hashes", () => {
  let salt: string;
  let password: string;

  beforeEach(() => {
    salt = Engine.generateSalt(4);
    password = "woo";
  });

  it("should produce a string", () => {
    expect(typeof Engine.hashSecret(password, salt)).toBe("string");
  });

  it("should raise an InvalidSalt error if the salt is invalid", () => {
    expect(() => Engine.hashSecret(password, "nino")).toThrow(Errors.InvalidSalt);
  });

  it("should raise an InvalidSecret error if the secret is invalid", () => {
    expect(() => Engine.hashSecret(Object.create(null), salt)).toThrow(Errors.InvalidSecret);
    expect(() => Engine.hashSecret(null, salt)).not.toThrow();
    expect(() => Engine.hashSecret(false, salt)).not.toThrow();
  });

  it("should call #to_s on the secret and use the return value as the actual secret data", () => {
    expect(Engine.hashSecret(false, salt)).toBe(Engine.hashSecret("false", salt));
  });

  it("should be interoperable with other implementations", () => {
    const longSecret =
      "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789chars after 72 are ignored";
    const testVectors = [
      ["U*U", "$2a$05$CCCCCCCCCCCCCCCCCCCCC.", "E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW"],
      ["U*U*", "$2a$05$CCCCCCCCCCCCCCCCCCCCC.", "VGOzA784oUp/Z0DY336zx7pLYAy0lwK"],
      ["U*U*U", "$2a$05$XXXXXXXXXXXXXXXXXXXXXO", "AcXxm9kjPGEMsLznoKqmqw7tc8WCx4a"],
      [longSecret, "$2a$05$abcdefghijklmnopqrstuu", "5s2v8.iXieOjg/.AySBTTZIIVFJeBui"],
      ["", "$2a$05$CCCCCCCCCCCCCCCCCCCCC.", "7uG0VCzI2bS7j6ymqJi9CdcdxiRTWNy"],
      ["", "$2a$06$DCq7YPn5Rq63x1Lad4cll.", "TV4S6ytwfsfvkgY8jIucDrjc8deX1s."],
      ["", "$2b$06$8eVN9RiU8Yki430X.wBvN.", "LWaqh2962emLVSVXVZIXJvDYLsV0oFu"],
      ["", "$2y$06$mFDtkz6UN7B3GZ2qi2hhaO", "3OFWzNEdcY84ELw6iHCPruuQfSAXBLK"],
      ["a", "$2a$06$m0CrhHm10qJ3lXRY.5zDGO", "3rS2KdeeWLuGmsfGlMfOxih58VYVfxe"],
      ["a", "$2b$06$ehKGYiS4wt2HAr7KQXS5z.", "OaRjB4jHO7rBHJKlGXbqEH3QVJfO7iO"],
      ["a", "$2y$06$LUdD6/aD0e/UbnxVAVbvGu", "UmIoJ3l/OK94ThhadpMWwKC34LrGEey"],
      ["abc", "$2a$06$If6bvum7DFjUnE9p2uDeDu", "0YHzrHM6tf.iqN8.yx.jNN1ILEf7h0i"],
      ["abc", "$2b$06$5FyQoicpbox1xSHFfhhdXu", "R2oxLpO1rYsQh5RTkI/9.RIjtoF0/ta"],
      ["abc", "$2y$06$ACfku9dT6.H8VjdKb8nhlu", "aoBmhJyK7GfoNScEfOfrJffUxoUeCjK"],
    ];
    for (const [secret, vectorSalt, checksum] of testVectors) {
      expect(Engine.hashSecret(secret, vectorSalt)).toBe(vectorSalt + checksum);
    }
  });

  it("should truncate long 1-byte character secrets to 72 bytes", () => {
    const tooLongSecret = "b".repeat(Engine.MAX_SECRET_BYTESIZE + 1);
    const justRightSecret = "b".repeat(Engine.MAX_SECRET_BYTESIZE);
    expect(Engine.hashSecret(tooLongSecret, salt)).toBe(Engine.hashSecret(justRightSecret, salt));
  });

  it("should truncate long multi-byte character secrets to 72 bytes", () => {
    const tooLongSecret = "𐐷".repeat(256);
    const justRightSecret = "𐐷".repeat(18);
    expect(Engine.hashSecret(tooLongSecret, salt)).toBe(Engine.hashSecret(justRightSecret, salt));
  });
});
