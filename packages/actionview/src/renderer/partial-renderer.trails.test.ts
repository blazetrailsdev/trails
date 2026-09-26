import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Base } from "../base.js";
import { LookupContext } from "../lookup-context.js";
import { TemplateHandlers } from "../template/handlers.js";
import { Tse } from "../template/handlers/tse.js";
import { FixtureResolver } from "../testing/resolvers.js";
import type { ViewContext } from "./abstract-renderer.js";
import type { Renderer } from "./renderer.js";

describe("PartialRenderer render blocks", () => {
  let lookupContext: LookupContext;
  let view: ViewContext;
  let renderer: Renderer;

  beforeEach(() => {
    TemplateHandlers.registerTemplateHandler("tse", new Tse());
    const resolver = new FixtureResolver({
      "layouts/_yield_only.html.tse": "<%= yield %>\n",
      "test/_partial.html.tse": "partial html",
      "test/_layout_for_partial.html.tse": "Before (<%= name %>)\n<%= yield %>\nAfter",
    });
    lookupContext = new LookupContext(null, {}, []);
    lookupContext.appendViewPaths([resolver]);
    const base = new (Base.withEmptyTemplateCache())(lookupContext, {}, null);
    renderer = base.viewRenderer;
    view = base as unknown as ViewContext;
  });

  afterEach(() => {
    TemplateHandlers.clear();
  });

  it("yields a partial to the caller's block through _layoutFor", async () => {
    const body = await renderer.renderPartial(
      view,
      { partial: "layouts/yield_only" },
      () => "Content from block!",
    );
    expect(body).toBe("Content from block!\n");
  });

  it("yields a partial's layout to the rendered partial", async () => {
    const body = await renderer.renderPartial(view, {
      partial: "test/partial",
      layout: "test/layout_for_partial",
      locals: { name: "Foo!" },
    });
    expect(body).toBe("Before (Foo!)\npartial html\nAfter");
  });

  it("yields a collection's layout to each rendered partial", async () => {
    const body = await renderer.renderPartial(view, {
      partial: "test/partial",
      collection: [1, 2],
      layout: "test/layout_for_partial",
      locals: { name: "Foo!" },
    });
    expect(body).toBe("Before (Foo!)\npartial html\nAfterBefore (Foo!)\npartial html\nAfter");
  });
});
