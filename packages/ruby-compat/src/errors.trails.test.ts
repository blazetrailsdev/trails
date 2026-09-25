import { describe, expect, it } from "vitest";
import { ArgumentError } from "./argument-error.js";
import { FloatDomainError } from "./float-domain-error.js";
import { FrozenError } from "./frozen-error.js";
import { IndexError } from "./index-error.js";
import { KeyError } from "./key-error.js";
import { NameError } from "./name-error.js";
import { NoMethodError } from "./no-method-error.js";
import { RangeError } from "./range-error.js";
import { StandardError } from "./standard-error.js";

describe("KeyError", () => {
  it("is an IndexError", () => {
    const error = new KeyError("key not found: :a");
    expect(error).toBeInstanceOf(IndexError);
    expect(error).toBeInstanceOf(StandardError);
  });

  it("exposes receiver and key only when given, as key_err_initialize does", () => {
    const receiver = { a: 1 };
    const error = new KeyError("key not found: :b", { receiver, key: "b" });
    expect(error.receiver()).toBe(receiver);
    expect(error.key()).toBe("b");
    expect(new KeyError("m", { key: null }).key()).toBeNull();
    expect(() => new KeyError("m").receiver()).toThrow(ArgumentError);
    expect(() => new KeyError("m").receiver()).toThrow("no receiver is available");
    expect(() => new KeyError("m").key()).toThrow("no key is available");
  });
});

describe("NoMethodError", () => {
  it("takes msg, name, args, private and receiver: in MRI's order", () => {
    const receiver = {};
    const error = new NoMethodError("undefined method 'x'", "x", [1, 2], true, { receiver });
    expect(error).toBeInstanceOf(NameError);
    expect(error.constantName).toBe("x");
    expect(error.args()).toEqual([1, 2]);
    expect(error.isPrivateCall()).toBe(true);
    expect(error.receiver()).toBe(receiver);
  });

  it("defaults args to nil and private_call? to false", () => {
    const error = new NoMethodError("undefined method 'x'");
    expect(error.args()).toBeNull();
    expect(error.isPrivateCall()).toBe(false);
    expect(() => error.receiver()).toThrow("no receiver is available");
  });
});

describe("FrozenError", () => {
  it("exposes the receiver: keyword", () => {
    const receiver = Object.freeze({});
    expect(new FrozenError("can't modify frozen Hash: {}", { receiver }).receiver()).toBe(receiver);
    expect(() => new FrozenError().receiver()).toThrow("no receiver is available");
    expect(new FrozenError().message).toBe("FrozenError");
  });
});

describe("FloatDomainError", () => {
  it("is a RangeError", () => {
    const error = new FloatDomainError("Infinity");
    expect(error).toBeInstanceOf(RangeError);
    expect(error).toBeInstanceOf(StandardError);
    expect(new RangeError("x").name).toBe("RangeError");
  });
});
