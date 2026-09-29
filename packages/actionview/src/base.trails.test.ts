import { afterEach, describe, it, expect } from "vitest";
import { include, initialize } from "@blazetrails/activesupport";

import { Base } from "./base.js";
import { LookupContext } from "./lookup-context.js";
import { Template } from "./template.js";
import { TemplateHandlers } from "./template/handlers.js";
import { Tse } from "./template/handlers/tse.js";
import { FixtureResolver } from "./testing/resolvers.js";

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
      expect(view.viewRenderer).toBe(renderer);
      expect(view.lookupContext).not.toBe(lookupContext);
      expect(view.viewRenderer).not.toBe(oldViewRenderer);
      expect(view.viewRenderer.lookupContext).toBe(view.lookupContext);
    });

    expect(view.lookupContext).toBe(lookupContext);
    expect(view.viewRenderer).toBe(oldViewRenderer);
  });
});

describe("ActionView::Base#render returns the renderer body unwrapped", () => {
  afterEach(() => {
    TemplateHandlers.clear();
  });

  const renderTse = (source: string): string => {
    TemplateHandlers.registerTemplateHandler("tse", new Tse());
    const lookupContext = new LookupContext(null, {}, []);
    lookupContext.appendViewPaths([new FixtureResolver({ "test/_bold.html.tse": "<b>bold</b>" })]);
    const view = new (Base.withEmptyTemplateCache())(lookupContext, {}, null);
    return String(
      new Template(source, "t", new Tse(), { locals: [], format: ":html" }).render(view, {}),
    );
  };

  it("escapes a render plain: body appended by <%= %> (template/text.rb:23-25)", () => {
    expect(renderTse('<%= render({ plain: "<b>" }) %>')).toBe("&lt;b&gt;");
  });

  it("does not escape a render partial: body, an OutputBuffer#to_s (template.rb:272)", () => {
    expect(renderTse('<%= render({ partial: "test/bold" }) %>')).toBe("<b>bold</b>");
  });
});
