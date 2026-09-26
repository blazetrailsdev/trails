import { describe, it, expect } from "vitest";
import { include, initialize } from "@blazetrails/activesupport";

import { Base } from "./base.js";
import { LookupContext } from "./lookup-context.js";

type DynProps = Record<string, unknown>;

describe("ActionView::Base#initialize seats included modules", () => {
  it("runs an included module's initialize at the base.rb:255 super", () => {
    const View = Base.withEmptyTemplateCache();
    include(View, {
      [initialize](this: DynProps) {
        this.dbRuntime = null;
      },
    });

    const view = new View(null, {}, null);
    expect(Object.hasOwn(view, "dbRuntime")).toBe(true);
    expect((view as unknown as DynProps).dbRuntime).toBe(null);
  });
});

describe("ActionView::Base#in_rendering_context", () => {
  it("swaps view_renderer with lookup_context and restores both (base.rb:290-309)", () => {
    const lookupContext = new LookupContext([]);
    const view = new (Base.withEmptyTemplateCache())(lookupContext, {}, null);
    const oldViewRenderer = view.viewRenderer;

    view.inRenderingContext({ formats: [":json"] }, (renderer) => {
      expect(view.lookupContext).toBe(renderer);
      expect(view.lookupContext).not.toBe(lookupContext);
      expect(view.viewRenderer).not.toBe(oldViewRenderer);
      expect(view.viewRenderer.lookupContext).toBe(view.lookupContext);
    });

    expect(view.lookupContext).toBe(lookupContext);
    expect(view.viewRenderer).toBe(oldViewRenderer);
  });
});
