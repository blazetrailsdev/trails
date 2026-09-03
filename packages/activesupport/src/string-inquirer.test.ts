import { describe, it, expect, beforeEach } from "vitest";
import { StringInquirer, inquiry } from "./string-inquirer.js";
import { EnvironmentInquirer } from "./environment-inquirer.js";
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

  it("is a String", () => {
    const s = inquiry.call("production");
    expect(s).toBeInstanceOf(String);
    expect(s.length).toBe(10);
    expect(s.toUpperCase()).toBe("PRODUCTION");
  });

  it("a subclass resolves its own state through the proxy", () => {
    const env = new EnvironmentInquirer("development");
    expect(env).toBeInstanceOf(String);
    expect(env).toBeInstanceOf(StringInquirer);
    expect(env.isLocal()).toBe(true);
    expect((env as any)["development?"]()).toBe(true);
  });

  it("valueOf returns original string", () => {
    const s = inquiry.call("test");
    expect(s.valueOf()).toBe("test");
  });
});
