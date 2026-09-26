import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DetailsKey, LookupContext } from "./lookup-context.js";
import { PathRegistry } from "./path-registry.js";
import { PathSet } from "./path-set.js";
import { TemplateHandlers } from "./template/handlers.js";
import { Tse } from "./template/handlers/tse.js";
import { FixtureResolver } from "./testing/resolvers.js";

describe("Template#compile! across DetailsKey.clear", () => {
  class ViewPathsOwner {}

  beforeEach(() => {
    TemplateHandlers.registerTemplateHandler("tse", new Tse());
  });

  afterEach(() => {
    TemplateHandlers.clear();
    PathRegistry.reset();
    DetailsKey.clear();
  });

  it("finds a fresh template for the fresh view-context class once the caches are cleared", () => {
    const resolver = new FixtureResolver({ "posts/_n.html.tse": "<%= 1 + 1 %>" });
    PathRegistry.setViewPaths(ViewPathsOwner, new PathSet([resolver]));
    const ctx = new LookupContext(null, {}, []);
    ctx.appendViewPaths([resolver]);

    const before = ctx.findTemplate("n", ["posts"], true);
    const containerBefore = DetailsKey.viewContextClass();
    expect(ctx.renderPartialSync("n", "posts", ":html")).toBe("2");

    DetailsKey.clear();

    const after = ctx.findTemplate("n", ["posts"], true);
    expect(DetailsKey.viewContextClass()).not.toBe(containerBefore);
    expect(after).not.toBe(before);
    expect(ctx.renderPartialSync("n", "posts", ":html")).toBe("2");
  });
});
