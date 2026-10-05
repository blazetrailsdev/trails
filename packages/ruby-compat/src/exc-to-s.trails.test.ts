import { describe, expect, it } from "vitest";
import { excToS } from "./exc-to-s.js";

describe("excToS", () => {
  it("answers the message of an exception", () => {
    expect(excToS(new TypeError("no such column"))).toBe("no such column");
  });

  it("answers the class name when the exception has no message", () => {
    const exc = new RangeError("out");
    (exc as { message: unknown }).message = undefined;
    expect(excToS(exc)).toBe("RangeError");
  });

  it("renders a thrown value that is not an Error", () => {
    expect(excToS("boom")).toBe("boom");
    expect(excToS(null)).toBe("");
  });
});
