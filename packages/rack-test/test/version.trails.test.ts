import { describe, it, expect } from "vitest";
import { VERSION } from "../lib/index.js";

describe("VERSION", () => {
  it("is a version string", () => {
    expect(VERSION).toMatch(/\d+\.\d+\.\d+/);
  });
});
