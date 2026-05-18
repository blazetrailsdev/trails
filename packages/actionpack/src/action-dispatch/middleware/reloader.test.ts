import { describe, it, expect } from "vitest";
import { Reloader } from "./reloader.js";
import { Executor } from "./executor.js";

describe("ReloaderTest", () => {
  it("inherits from Executor", () => {
    expect(Object.getPrototypeOf(Reloader)).toBe(Executor);
  });
});
