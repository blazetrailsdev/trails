import { Process } from "@blazetrails/ruby-compat/process";
import { describe, expect, it } from "vitest";
import { ForkTracker } from "../lib/fork-tracker.js";

describe("ForkTracker (trails-only)", () => {
  it("runs no callback while the pid is unchanged, and unregisters one", () => {
    let called = false;
    const handler = ForkTracker.afterFork(() => {
      called = true;
    });
    ForkTracker.afterForkCallback();
    expect(called).toBe(false);
    expect(ForkTracker.unregister(handler)).toBe(handler);
    expect(ForkTracker.unregister(handler)).toBeNull();
  });

  it("hook! prepends CoreExt onto Process' singleton class", () => {
    expect((Process as unknown as { _fork: unknown })._fork).toBe(ForkTracker.CoreExt._fork);
  });
});
