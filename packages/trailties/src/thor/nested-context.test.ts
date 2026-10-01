import { describe, it } from "vitest";
import { assertNotPredicate, assertPredicate } from "@blazetrails/activesupport";
import { NestedContext } from "./nested-context.js";

describe("Thor::NestedContext", () => {
  describe("#enter", () => {
    it("is never empty within the entered block", () => {
      const context = new NestedContext();
      context.enter(() => {
        context.enter(() => {});

        assertPredicate(context, (c) => c.isEntered());
      });
    });

    it("is empty when outside of all blocks", () => {
      const context = new NestedContext();
      context.enter(() => context.enter(() => {}));
      assertNotPredicate(context, (c) => c.isEntered());
    });
  });
});
