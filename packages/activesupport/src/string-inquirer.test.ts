import { describe, it, expect } from "vitest";
import { StringInquirer, inquiry } from "./string-inquirer.js";

describe("StringInquirerTest", () => {
  it("match", () => {
    const env = inquiry("production");
    expect((env as any).production()).toBe(true);
  });

  it("miss", () => {
    const env = inquiry("production");
    expect((env as any).development()).toBe(false);
  });

  it("missing question mark", () => {
    const env = inquiry("test");
    // Without ? still returns a callable function (TS adaptation)
    expect(typeof (env as any).test).toBe("function");
  });

  it("respond to", () => {
    const env = inquiry("production");
    expect(typeof (env as any).production).toBe("function");
  });

  it("respond to fallback to string respond to", () => {
    const env = inquiry("production");
    expect(env.toString()).toBe("production");
  });
});

describe("StringInquirer", () => {
  it("inquiry factory creates inquirer from string", () => {
    const env = inquiry("test");
    expect(env.is("test")).toBe(true);
    expect(env.is("production")).toBe(false);
  });

  it("is() method checks equality", () => {
    const s = new StringInquirer("staging");
    expect(s.is("staging")).toBe(true);
    expect(s.is("production")).toBe(false);
  });

  it("toString returns original string", () => {
    const s = inquiry("development");
    expect(s.toString()).toBe("development");
    expect(String(s)).toBe("development");
  });

  it("valueOf returns original string", () => {
    const s = inquiry("test");
    expect(s.valueOf()).toBe("test");
  });

  it("question mark methods return true/false", () => {
    const env = inquiry("production");
    expect((env as any).production()).toBe(true);
    expect((env as any).staging()).toBe(false);
    expect((env as any).development()).toBe(false);
  });
});
