import { describe, it, expect } from "vitest";
import { Types } from "../index.js";

describe("DateTest", () => {
  it("type cast date", () => {
    const type = new Types.DateType();
    const result = type.cast("2024-01-15");
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2024);
  });

  it("returns correct year", () => {
    const type = new Types.DateType();
    const result = type.cast("2024-01-15");
    expect(result!.getUTCFullYear()).toBe(2024);
  });
});
