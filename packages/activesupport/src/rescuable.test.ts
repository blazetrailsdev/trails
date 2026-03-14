import { describe, it, expect } from "vitest";

import { rescueFrom, handleRescue } from "./module-ext.js";

describe("RescuableTest", () => {
  it("rescue from with method", () => {
    const handled: Error[] = [];
    const target = {
      handleError(e: Error) {
        handled.push(e);
      },
    };
    rescueFrom(target, Error, { with: "handleError" });
    const err = new Error("oops");
    expect(handleRescue(target, err)).toBe(true);
    expect(handled).toContain(err);
  });

  it("rescue from with block", () => {
    const handled: Error[] = [];
    const target = {};
    rescueFrom(target, Error, { with: (e: Error) => handled.push(e) });
    const err = new Error("boom");
    expect(handleRescue(target, err)).toBe(true);
    expect(handled).toContain(err);
  });

  it("rescue from with block with args", () => {
    const log: string[] = [];
    const target = {};
    rescueFrom(target, TypeError, { with: (e: Error) => log.push(e.message) });
    const err = new TypeError("type error");
    handleRescue(target, err);
    expect(log).toContain("type error");
  });

  it("rescues defined later are added at end of the rescue handlers array", () => {
    const log: string[] = [];
    const target = {};
    rescueFrom(target, Error, { with: () => log.push("first") });
    rescueFrom(target, TypeError, { with: () => log.push("second") });
    handleRescue(target, new TypeError("t"));
    expect(log).toContain("second");
  });

  it("unhandled exceptions", () => {
    const target = {};
    rescueFrom(target, TypeError, { with: () => {} });
    // A RangeError should not be handled
    expect(handleRescue(target, new RangeError("range"))).toBe(false);
  });
});
