import { beforeEach, describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { Engine, Errors, Password } from "./index.js";

describe("Creating a hashed password", () => {
  let password: Password;

  beforeEach(() => {
    password = Password.create("wheedle", { cost: 4 });
  });

  it("should return a BCrypt::Password", () => {
    expect(password).toBeInstanceOf(Password);
  });

  it("should return a valid bcrypt password", () => {
    expect(() => new Password(password)).not.toThrow();
  });

  it("should behave normally if the secret is not a string", () => {
    expect(() => Password.create(null)).not.toThrow();
    expect(() => Password.create({ woo: "yeah" })).not.toThrow();
    expect(() => Password.create(false)).not.toThrow();
  });

  it("should tolerate empty string secrets", () => {
    expect(() => Password.create("\n".slice(0, -1))).not.toThrow();
    expect(() => Password.create("")).not.toThrow();
    expect(() => Password.create(String())).not.toThrow();
  });

  it("should tolerate very long string secrets", () => {
    expect(() => Password.create("abcd".repeat(1024))).not.toThrow();
  });

  it("blows up when null bytes are in the string", () => {
    expect(() => Password.create("foo\0bar".slice(0, -1))).toThrow();
  });
});

describe("Reading a hashed password", () => {
  const hash = "$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW";

  it("the cost is too damn high", () => {
    expect(() => Password.create("hello", { cost: 32 })).toThrow(ArgumentError);
  });

  it("the cost should be set to the default if nil", () => {
    expect(Password.create("hello", { cost: null }).cost).toBe(Engine.DEFAULT_COST);
  });

  it("the cost should be set to the default if empty hash", () => {
    expect(Password.create("hello", {}).cost).toBe(Engine.DEFAULT_COST);
  });

  it("the cost should be set to the passed value if provided", () => {
    expect(Password.create("hello", { cost: 5 }).cost).toBe(5);
  });

  it("the cost should be set to the global value if set", () => {
    Engine.cost = 5;
    expect(Password.create("hello").cost).toBe(5);
    Engine.cost = null;
  });

  it("the cost should be set to an overridden constant for backwards compatibility", () => {
    const oldDefaultCost = Engine.DEFAULT_COST;

    Engine.DEFAULT_COST = 5;
    expect(Password.create("hello").cost).toBe(5);

    Engine.DEFAULT_COST = oldDefaultCost;
  });

  it("should read the version, cost, salt, and hash", () => {
    const password = new Password(hash);
    expect(password.version).toBe("2a");
    expect(typeof password.version).toBe("string");
    expect(password.cost).toBe(5);
    expect(password.salt).toBe("$2a$05$CCCCCCCCCCCCCCCCCCCCC.");
    expect(typeof password.salt).toBe("string");
    expect(password.checksum).toBe("E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW");
    expect(typeof password.checksum).toBe("string");
    expect(password.toString()).toBe(hash);
  });

  it("should raise an InvalidHashError when given an invalid hash", () => {
    expect(() => new Password("weedle")).toThrow(Errors.InvalidHash);
  });
});

describe("Comparing a hashed password with a secret", () => {
  const secret = "U*U";
  let password: Password;

  beforeEach(() => {
    password = Password.create(secret);
  });

  it("should compare successfully to the original secret", () => {
    expect(password.equals(secret)).toBe(true);
  });

  it("should compare unsuccessfully to anything besides original secret", () => {
    expect(password.equals("@secret")).toBe(false);
  });
});

describe("Validating a generated salt", () => {
  it("should not accept an invalid salt", () => {
    expect(Engine.isValidSalt("invalid")).toBe(false);
    expect(Engine.isValidSalt(`invalid\n${Engine.generateSalt()}\ninvalid`)).toBe(false);
  });

  it("should accept a valid salt", () => {
    expect(Engine.isValidSalt(Engine.generateSalt())).toBe(true);
  });
});

describe("Validating a password hash", () => {
  it("should not accept an invalid password", () => {
    expect(Password.isValidHash("i_am_so_not_valid")).toBe(false);
    expect(Password.isValidHash(`invalid\n${Password.create("i_am_so_valid")}\ninvalid`)).toBe(
      false,
    );
  });

  it("should accept a valid password", () => {
    expect(Password.isValidHash(Password.create("i_am_so_valid"))).toBe(true);
  });
});
