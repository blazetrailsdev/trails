import { describe, expect, it } from "vitest";
import { VERSION } from "./index.js";

describe("SolidQueue::VERSION", () => {
  it("matches the vendored gem", () => {
    expect(VERSION).toBe("1.1.3");
  });
});
