import { beforeEach, describe, expect, it } from "vitest";
import { Time } from "@blazetrails/date";
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
    const startTime = Time.now();
    Password.create("testing testing", { cost: Engine.MIN_COST + 1 });
    const minTimeMs = (Time.now().minus(startTime) as number) * 1000;
    const first = Engine.calibrate(minTimeMs) as number;
    const second = Engine.calibrate(minTimeMs * 4) as number;
    expect(second).toBeGreaterThan(first);
  });
});

describe("Generating BCrypt salts", () => {
  it("should produce strings", () => {
    expect(Object(Engine.generateSalt())).toBeInstanceOf(String);
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
  let salt: string | null;
  let password: string;

  beforeEach(() => {
    salt = Engine.generateSalt(4);
    password = "woo";
  });

  it("should produce a string", () => {
    expect(Object(Engine.hashSecret(password, salt))).toBeInstanceOf(String);
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
    const testVectors = [
      ["U*U", "$2a$05$CCCCCCCCCCCCCCCCCCCCC.", "E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW"],
      ["U*U*", "$2a$05$CCCCCCCCCCCCCCCCCCCCC.", "VGOzA784oUp/Z0DY336zx7pLYAy0lwK"],
      ["U*U*U", "$2a$05$XXXXXXXXXXXXXXXXXXXXXO", "AcXxm9kjPGEMsLznoKqmqw7tc8WCx4a"],
      [
        "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789chars after 72 are ignored",
        "$2a$05$abcdefghijklmnopqrstuu",
        "5s2v8.iXieOjg/.AySBTTZIIVFJeBui",
      ],
      ["", "$2a$05$CCCCCCCCCCCCCCCCCCCCC.", "7uG0VCzI2bS7j6ymqJi9CdcdxiRTWNy"],
      ["", "$2a$06$DCq7YPn5Rq63x1Lad4cll.", "TV4S6ytwfsfvkgY8jIucDrjc8deX1s."],
      ["", "$2a$08$HqWuK6/Ng6sg9gQzbLrgb.", "Tl.ZHfXLhvt/SgVyWhQqgqcZ7ZuUtye"],
      ["", "$2a$10$k1wbIrmNyFAPwPVPSVa/ze", "cw2BCEnBwVS2GbrmgzxFUOqW9dk4TCW"],
      ["", "$2a$12$k42ZFHFWqBp3vWli.nIn8u", "YyIkbvYRvodzbfbK18SSsY.CsIQPlxO"],
      ["", "$2b$06$8eVN9RiU8Yki430X.wBvN.", "LWaqh2962emLVSVXVZIXJvDYLsV0oFu"],
      ["", "$2b$06$NlgfNgpIc6GlHciCkMEW8u", "KOBsyvAp7QwlHpysOlKdtyEw50WQua2"],
      ["", "$2y$06$mFDtkz6UN7B3GZ2qi2hhaO", "3OFWzNEdcY84ELw6iHCPruuQfSAXBLK"],
      ["", "$2y$06$88kSqVttBx.e9iXTPCLa5u", "FPrVFjfLH4D.KcO6pBiAmvUkvdg0EYy"],
      ["a", "$2a$06$m0CrhHm10qJ3lXRY.5zDGO", "3rS2KdeeWLuGmsfGlMfOxih58VYVfxe"],
      ["a", "$2a$08$cfcvVd2aQ8CMvoMpP2EBfe", "odLEkkFJ9umNEfPD18.hUF62qqlC/V."],
      ["a", "$2a$10$k87L/MF28Q673VKh8/cPi.", "SUl7MU/rWuSiIDDFayrKk/1tBsSQu4u"],
      ["a", "$2a$12$8NJH3LsPrANStV6XtBakCe", "z0cKHXVxmvxIlcz785vxAIZrihHZpeS"],
      ["a", "$2b$06$ehKGYiS4wt2HAr7KQXS5z.", "OaRjB4jHO7rBHJKlGXbqEH3QVJfO7iO"],
      ["a", "$2b$06$PWxFFHA3HiCD46TNOZh30e", "Nto1hg5uM9tHBlI4q/b03SW/gGKUYk6"],
      ["a", "$2y$06$LUdD6/aD0e/UbnxVAVbvGu", "UmIoJ3l/OK94ThhadpMWwKC34LrGEey"],
      ["a", "$2y$06$eqgY.T2yloESMZxgp76deO", "ROa7nzXDxbO0k.PJvuClTa.Vu1AuemG"],
      ["abc", "$2a$06$If6bvum7DFjUnE9p2uDeDu", "0YHzrHM6tf.iqN8.yx.jNN1ILEf7h0i"],
      ["abc", "$2a$08$Ro0CUfOqk6cXEKf3dyaM7O", "hSCvnwM9s4wIX9JeLapehKK5YdLxKcm"],
      ["abc", "$2a$10$WvvTPHKwdBJ3uk0Z37EMR.", "hLA2W6N9AEBhEgrAOljy2Ae5MtaSIUi"],
      ["abc", "$2a$12$EXRkfkdmXn2gzds2SSitu.", "MW9.gAVqa9eLS1//RYtYCmB1eLHg.9q"],
      ["abc", "$2b$06$5FyQoicpbox1xSHFfhhdXu", "R2oxLpO1rYsQh5RTkI/9.RIjtoF0/ta"],
      ["abc", "$2b$06$1kJyuho8MCVP3HHsjnRMkO", "1nvCOaKTqLnjG2TX1lyMFbXH/aOkgc."],
      ["abc", "$2y$06$ACfku9dT6.H8VjdKb8nhlu", "aoBmhJyK7GfoNScEfOfrJffUxoUeCjK"],
      ["abc", "$2y$06$9JujYcoWPmifvFA3RUP90e", "5rSEHAb5Ye6iv3.G9ikiHNv5cxjNEse"],
      [
        "abcdefghijklmnopqrstuvwxyz",
        "$2a$06$.rCVZVOThsIa97pEDOxvGu",
        "RRgzG64bvtJ0938xuqzv18d3ZpQhstC",
      ],
      [
        "abcdefghijklmnopqrstuvwxyz",
        "$2a$08$aTsUwsyowQuzRrDqFflhge",
        "kJ8d9/7Z3GV3UcgvzQW3J5zMyrTvlz.",
      ],
      [
        "abcdefghijklmnopqrstuvwxyz",
        "$2a$10$fVH8e28OQRj9tqiDXs1e1u",
        "xpsjN0c7II7YPKXua2NAKYvM6iQk7dq",
      ],
      [
        "abcdefghijklmnopqrstuvwxyz",
        "$2a$12$D4G5f18o7aMMfwasBL7Gpu",
        "QWuP3pkrZrOAnqP.bmezbMng.QwJ/pG",
      ],
      [
        "abcdefghijklmnopqrstuvwxyz",
        "$2b$06$O8E89AQPj1zJQA05YvIAU.",
        "hMpj25BXri1bupl/Q7CJMlpLwZDNBoO",
      ],
      [
        "abcdefghijklmnopqrstuvwxyz",
        "$2b$06$PDqIWr./o/P3EE/P.Q0A/u",
        "Fg86WL/PXTbaW267TDALEwDylqk00Z.",
      ],
      [
        "abcdefghijklmnopqrstuvwxyz",
        "$2y$06$34MG90ZLah8/ZNr3ltlHCu",
        "z6bachF8/3S5jTuzF1h2qg2cUk11sFW",
      ],
      [
        "abcdefghijklmnopqrstuvwxyz",
        "$2y$06$AK.hSLfMyw706iEW24i68u",
        "KAc2yorPTrB0cimvjJHEBUrPkOq7VvG",
      ],
      [
        "~!@#$%^&*()      ~!@#$%^&*()PNBFRD",
        "$2a$06$fPIsBO8qRqkjj273rfaOI.",
        "HtSV9jLDpTbZn782DC6/t7qT67P6FfO",
      ],
      [
        "~!@#$%^&*()      ~!@#$%^&*()PNBFRD",
        "$2a$08$Eq2r4G/76Wv39MzSX262hu",
        "zPz612MZiYHVUJe/OcOql2jo4.9UxTW",
      ],
      [
        "~!@#$%^&*()      ~!@#$%^&*()PNBFRD",
        "$2a$10$LgfYWkbzEvQ4JakH7rOvHe",
        "0y8pHKF9OaFgwUZ2q7W2FFZmZzJYlfS",
      ],
      [
        "~!@#$%^&*()      ~!@#$%^&*()PNBFRD",
        "$2a$12$WApznUOJfkEGSmYRfnkrPO",
        "r466oFDCaj4b6HY3EXGvfxm43seyhgC",
      ],
      [
        "~!@#$%^&*()      ~!@#$%^&*()PNBFRD",
        "$2b$06$FGWA8OlY6RtQhXBXuCJ8Wu",
        "sVipRI15cWOgJK8MYpBHEkktMfbHRIG",
      ],
      [
        "~!@#$%^&*()      ~!@#$%^&*()PNBFRD",
        "$2b$06$G6aYU7UhUEUDJBdTgq3CRe",
        "kiopCN4O4sNitFXrf5NUscsVZj3a2r6",
      ],
      [
        "~!@#$%^&*()      ~!@#$%^&*()PNBFRD",
        "$2y$06$sYDFHqOcXTjBgOsqC0WCKe",
        "Md3T1UhHuWQSxncLGtXDLMrcE6vFDti",
      ],
      [
        "~!@#$%^&*()      ~!@#$%^&*()PNBFRD",
        "$2y$06$6Xm0gCw4g7ZNDCEp4yTise",
        "z0kSdpXEl66MvdxGidnmChIe8dFmMnq",
      ],
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
