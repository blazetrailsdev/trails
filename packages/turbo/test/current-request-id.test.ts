import { describe, expect, it } from "vitest";
import "./test-helper.js";
import { Turbo } from "../lib/turbo-trails.js";

describe("Turbo::CurrentRequestIdTest", () => {
  it("sets the current request id for a block of code", () => {
    expect(Turbo.currentRequestId).toBeNull();

    const result = Turbo.withRequestId("123", () => {
      expect(Turbo.currentRequestId).toBe("123");
      return "the_result";
    });

    expect(result).toBe("the_result");
    expect(Turbo.currentRequestId).toBeNull();
  });

  it("raised errors will raise and clear the current request id", () => {
    expect(Turbo.currentRequestId).toBeNull();

    expect(() =>
      Turbo.withRequestId("123", () => {
        throw new Error("Some error");
      }),
    ).toThrow("Some error");

    expect(Turbo.currentRequestId).toBeNull();
  });
});
