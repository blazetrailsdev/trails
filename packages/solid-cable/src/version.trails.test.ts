import { describe, expect, it } from "vitest";
import { VERSION } from "./index.js";

describe("SolidCable::VERSION", () => {
  it("matches the vendored gem", () => {
    expect(VERSION).toBe("3.0.7");
  });
});
