import { describe, it, expect } from "vitest";
import { include, initialize } from "@blazetrails/activesupport";

import { Base } from "./base.js";

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
