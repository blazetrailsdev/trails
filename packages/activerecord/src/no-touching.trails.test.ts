import { describe, it, expect } from "vitest";
import { Thread } from "@blazetrails/ruby-compat";
import { IsolatedExecutionState } from "@blazetrails/activesupport";
import { Base } from "./index.js";
import { applyTo, isAppliedTo } from "./no-touching.js";

describe("NoTouching.klasses", () => {
  it("is the execution state's active_record_no_touching_classes array, pushed and popped by apply_to", async () => {
    await applyTo(Base, async () => {
      expect(IsolatedExecutionState.get("active_record_no_touching_classes")).toEqual([Base]);
      expect(isAppliedTo(Base)).toBe(true);
    });

    expect(IsolatedExecutionState.get("active_record_no_touching_classes")).toEqual([]);
    expect(isAppliedTo(Base)).toBe(false);
  });

  it("is not shared with another thread", async () => {
    await applyTo(Base, async () => {
      const other = await new Thread(async () => isAppliedTo(Base)).value();

      expect(other).toBe(false);
      expect(isAppliedTo(Base)).toBe(true);
    });
  });

  it("pops when the block raises", () => {
    expect(() =>
      applyTo(Base, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");

    expect(isAppliedTo(Base)).toBe(false);
  });
});
