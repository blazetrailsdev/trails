import { describe, expect, it } from "vitest";
import { Error } from "../lib/error.js";

describe("Error", () => {
  it("substitutes :troubleshooting: on every message read", () => {
    class LateError extends Error {}
    const error = new LateError("Failed. :troubleshooting:");
    expect(error.message).toContain("Visit the Troubleshooting guide");
    expect(error.message).not.toContain(":troubleshooting:");
  });
});
