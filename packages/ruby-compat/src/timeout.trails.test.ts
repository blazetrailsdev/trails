import { describe, expect, it } from "vitest";
import { ArgumentError } from "./argument-error.js";
import { Timeout } from "./timeout.js";

describe("Timeout.timeout", () => {
  const never = () => new Promise<never>(() => {});

  it("answers the block's value, and yields sec without a timer when it is nil or zero", async () => {
    expect(await Timeout.timeout(5, undefined, undefined, (sec) => sec)).toBe(5);
    expect(await Timeout.timeout(0, undefined, undefined, () => "now")).toBe("now");
    expect(await Timeout.timeout(null, undefined, undefined, (sec) => sec)).toBeNull();
  });

  it("raises Timeout::Error, or the class and message given, once sec has passed", async () => {
    await expect(Timeout.timeout(0.001, undefined, undefined, never)).rejects.toThrow(
      new Timeout.Error("execution expired"),
    );
    await expect(Timeout.timeout(0.001, ArgumentError, "late", never)).rejects.toThrow(
      new ArgumentError("late"),
    );
  });
});
