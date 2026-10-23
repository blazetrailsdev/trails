import { describe, it, expect } from "vitest";
import { VERSION, RELEASE, release } from "./index.js";

describe("RELEASE", () => {
  it("is the same as VERSION", () => {
    expect(RELEASE).toBe(VERSION);
  });
});

describe(".release", () => {
  it("returns the version string", () => {
    expect(release()).toBe(VERSION);
  });
});
