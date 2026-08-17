import { describe, it, expect, beforeEach } from "vitest";
import { StringInquirer, inquiry } from "./string-inquirer.js";
import {
  assertNotPredicate,
  assertNotRespondTo,
  assertPredicate,
  assertRespondTo,
} from "./testing/assertions.js";

describe("StringInquirerTest", () => {
  let stringInquirer: StringInquirer;

  beforeEach(() => {
    stringInquirer = new StringInquirer("production");
  });

  it("match", () => {
    assertPredicate(stringInquirer, (s) => (s as any)["production?"]());
  });

  it("miss", () => {
    assertNotPredicate(stringInquirer, (s) => (s as any)["development?"]());
  });

  it("missing question mark", () => {
    expect(() => (stringInquirer as any).production()).toThrow(/undefined method 'production'/);
  });

  it("respond to", () => {
    assertRespondTo(stringInquirer, "development?");
  });

  it("respond to fallback to string respond to", () => {
    // Rails reopens `String` with a `respond_to_missing?` that answers `:bar`.
    // The `super` arm of the inquirer's `has` trap is the prototype chain, so
    // teaching `String` one more name is `String.prototype`.
    Object.defineProperty(String.prototype, "bar", { value: () => true, configurable: true });
    const str = new StringInquirer("hello");

    try {
      assertRespondTo(str, "are_you_ready?");
      assertRespondTo(str, "bar");
      assertNotRespondTo(str, "nope");
    } finally {
      delete (String.prototype as any).bar;
    }
  });
});

describe("StringInquirer", () => {
  it("inquiry factory wraps the receiver", () => {
    const env = inquiry.call("test");
    expect(env).toBeInstanceOf(StringInquirer);
    expect((env as any)["test?"]()).toBe(true);
    expect((env as any)["production?"]()).toBe(false);
  });

  it("toString returns original string", () => {
    const s = inquiry.call("development");
    expect(s.toString()).toBe("development");
    expect(String(s)).toBe("development");
  });

  it("valueOf returns original string", () => {
    const s = inquiry.call("test");
    expect(s.valueOf()).toBe("test");
  });
});
