import { describe, it, expect, beforeEach } from "vitest";
import { ArrayInquirer, inquiry } from "./array-inquirer.js";
import {
  assert,
  assertNot,
  assertNotPredicate,
  assertNotRespondTo,
  assertPredicate,
  assertRespondTo,
} from "./testing/assertions.js";

describe("ArrayInquirerTest", () => {
  let arrayInquirer: ArrayInquirer<string>;

  beforeEach(() => {
    arrayInquirer = new ArrayInquirer("mobile", "tablet", "api");
  });

  it("individual", () => {
    assertPredicate(arrayInquirer, (a) => (a as any)["mobile?"]());
    assertPredicate(arrayInquirer, (a) => (a as any)["tablet?"]());
    assertNotPredicate(arrayInquirer, (a) => (a as any)["desktop?"]());
  });

  it("any", () => {
    assert(arrayInquirer.any("mobile", "desktop"));
    assert(arrayInquirer.any("watch", "tablet"));
    assertNot(arrayInquirer.any("desktop", "watch"));
  });

  it("any string symbol mismatch", () => {
    assert(arrayInquirer.any("mobile"));
    assert(arrayInquirer.any("api"));
  });

  it("any with block", () => {
    assert(arrayInquirer.any((v) => v === "mobile"));
    assertNot(arrayInquirer.any((v) => v === "desktop"));
  });

  it("respond to", () => {
    assertRespondTo(arrayInquirer, "development?");
  });

  it("inquiry", () => {
    const result = inquiry.call(["mobile", "tablet", "api"]);

    expect(result).toBeInstanceOf(ArrayInquirer);
    expect(result).toEqual(arrayInquirer);
  });

  it("respond to fallback to array respond to", () => {
    Object.defineProperty(Array.prototype, "foo", { value: () => true, configurable: true });
    const arr = new ArrayInquirer("x");

    try {
      assertRespondTo(arr, "can_you_hear_me?");
      assertRespondTo(arr, "foo");
      assertNotRespondTo(arr, "nope");
    } finally {
      delete (Array.prototype as any).foo;
    }
  });
});

describe("ArrayInquirer", () => {
  it("any() with no args returns true when non-empty", () => {
    const ai = new ArrayInquirer("a", "b");
    expect(ai.any()).toBe(true);
  });

  it("any() with no args returns false when empty", () => {
    const ai = new ArrayInquirer();
    expect(ai.any()).toBe(false);
  });

  it("a name without a question mark raises NoMethodError", () => {
    const ai = new ArrayInquirer("a");
    expect(() => (ai as any).mobile()).toThrow(/undefined method 'mobile'/);
  });
});
