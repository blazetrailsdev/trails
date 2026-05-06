import { describe, it, expect, vi, afterEach } from "vitest";
import { getEnv } from "./environment.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getEnv", () => {
  it("returns the env var value when set", () => {
    vi.stubEnv("TEST_KEY", "hello");
    expect(getEnv("TEST_KEY")).toBe("hello");
  });

  it("returns undefined when the var is unset", () => {
    expect(getEnv("SURELY_NOT_SET_XYZ_12345")).toBeUndefined();
  });

  it("returns defaultValue when the var is unset", () => {
    expect(getEnv("SURELY_NOT_SET_XYZ_12345", "fallback")).toBe("fallback");
  });

  it("returns the var value over defaultValue when the var is set", () => {
    vi.stubEnv("TEST_KEY", "real");
    expect(getEnv("TEST_KEY", "fallback")).toBe("real");
  });
});
