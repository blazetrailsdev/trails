import { describe, expect, it } from "vitest";
import { NestedContext } from "./nested-context.js";

describe("Thor::NestedContext", () => {
  describe("#enter", () => {
    it("is never empty within the entered block", () => {
      const context = new NestedContext();
      context.enter(() => {
        context.enter(() => {});

        expect(context.isEntered()).toBe(true);
      });
    });

    it("is empty when outside of all blocks", () => {
      const context = new NestedContext();
      context.enter(() => context.enter(() => {}));
      expect(context.isEntered()).toBe(false);
    });
  });
});
