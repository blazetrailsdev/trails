import { describe, expect, it } from "vitest";
import { KeyError, RuntimeError, StandardError } from "./index.js";

describe("Exception#detailedMessage", () => {
  it("appends the class name to the first line", () => {
    expect(new KeyError("key not found").detailedMessage()).toBe("key not found (KeyError)");
    expect(new StandardError("a\nb").detailedMessage()).toBe("a (StandardError)\nb");
  });

  it("answers the class name alone for an empty message", () => {
    expect(new StandardError("").detailedMessage()).toBe("StandardError");
    expect(new RuntimeError("").detailedMessage()).toBe("unhandled exception");
  });

  it("highlights each line", () => {
    expect(new StandardError("a\nb").detailedMessage({ highlight: true })).toBe(
      "\x1b[1ma (\x1b[1;4mStandardError\x1b[m\x1b[1m)\x1b[m\n\x1b[1mb\x1b[m",
    );
  });
});
