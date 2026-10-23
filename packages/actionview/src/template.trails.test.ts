import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TopLevel } from "@blazetrails/activesupport";
import { Base } from "./base.js";
import { DetailsKey, LookupContext } from "./lookup-context.js";
import { PathRegistry } from "./path-registry.js";
import { PathSet } from "./path-set.js";
import { Template } from "./template.js";
import { EncodingError, WrongEncodingError } from "./template/error.js";
import { TemplateHandlers } from "./template/handlers.js";
import { TSE } from "./template/handlers/tse.js";
import { FixtureResolver } from "./testing/resolvers.js";

describe("Template#compile! across DetailsKey.clear", () => {
  class ViewPathsOwner {}

  beforeEach(() => {
    TemplateHandlers.registerTemplateHandler("tse", new TSE());
  });

  afterEach(() => {
    TemplateHandlers.clear();
    PathRegistry.reset();
    DetailsKey.clear();
  });

  it("finds a fresh template for the fresh view-context class once the caches are cleared", async () => {
    const resolver = new FixtureResolver({ "posts/_n.html.tse": "<%= 1 + 1 %>" });
    PathRegistry.setViewPaths(ViewPathsOwner, new PathSet([resolver]));
    const ctx = new LookupContext(null, {}, ["posts"]);
    ctx.appendViewPaths([resolver]);
    const renderN = async () =>
      String(await new (DetailsKey.viewContextClass())(ctx, {}, null).render("n"));

    const before = ctx.findTemplate("n", ["posts"], true);
    const containerBefore = DetailsKey.viewContextClass();
    expect(await renderN()).toBe("2");

    DetailsKey.clear();

    const after = ctx.findTemplate("n", ["posts"], true);
    expect(DetailsKey.viewContextClass()).not.toBe(containerBefore);
    expect(after).not.toBe(before);
    expect(await renderN()).toBe("2");
  });
});

describe("Template#compile", () => {
  afterEach(() => {
    TemplateHandlers.clear();
  });

  it("names the compiled source after the identifier without evaluating it", async () => {
    TemplateHandlers.registerTemplateHandler("tse", new TSE());
    const g = globalThis as { __templateIdentifierEvaluated?: boolean };
    const t = new Template(
      "hi",
      "posts/show.html.tse\nglobalThis.__templateIdentifierEvaluated = true;",
      new TSE(),
      { locals: [], format: ":html" },
    );
    expect(String(await t.render(new (Base.withEmptyTemplateCache())(null, {}, null)))).toBe("hi");
    expect(g.__templateIdentifierEvaluated).toBeUndefined();
  });
});

describe("Template#compiled_source", () => {
  it("raises WrongEncodingError when the handler returns code that is not valid UTF-16", async () => {
    const t = new Template(
      "hi",
      "posts/show",
      { call: () => "return 'a\uD800b';" },
      { locals: [], format: ":html" },
    );
    let raised: unknown;
    try {
      await t.render(new (Base.withEmptyTemplateCache())(null, {}, null));
    } catch (e) {
      raised = e;
    }
    const original = (raised as { cause?: unknown }).cause ?? raised;
    expect(original).toBeInstanceOf(WrongEncodingError);
    expect(original).toBeInstanceOf(EncodingError);
    expect((original as Error).message).toMatch(
      /^Your template was not saved as valid \. Please either specify {2}as the encoding/,
    );
  });
});

describe("Template#compiled_source resolves top-level constants", () => {
  const renderTse = async (source: string): Promise<string> =>
    String(
      await new Template(source, "t", new TSE(), { locals: [], format: ":html" }).render(
        new (Base.withEmptyTemplateCache())(null, {}, null),
        {},
      ),
    );

  it("resolves a seated TopLevel constant with no local passed", async () => {
    expect(await renderTse("<%= I18n.locale() %>")).toBe("en");
  });

  it("still resolves JS globals past the TopLevel scope", async () => {
    expect(await renderTse("<%= Math.max(1, 2) %> <%= JSON.stringify([1]) %>")).toBe("2 [1]");
  });
});

describe("Template#shortIdentifier under a defined Trails.root", () => {
  const originalTrails = TopLevel.Trails;
  const originalAnnotate = Base.annotateRenderedViewWithFilenames;

  beforeEach(() => {
    TopLevel.Trails = { root: () => "/srv/app" } as unknown as typeof TopLevel.Trails;
  });

  afterEach(() => {
    TopLevel.Trails = originalTrails;
    Base.annotateRenderedViewWithFilenames = originalAnnotate;
  });

  const newTemplate = () =>
    new Template("<p>hi</p>", "/srv/app/app/views/posts/show.html.tse", new TSE(), {
      locals: [],
      format: ":html",
    });

  it("strips the root from inspect", () => {
    expect(newTemplate().inspect()).toBe(
      "#<ActionView::Template app/views/posts/show.html.tse locals=[]>",
    );
  });

  it("annotates a render with the root-relative path", () => {
    Base.annotateRenderedViewWithFilenames = true;
    const template = newTemplate();
    const code = new TSE().call(template, template.source);
    expect(code).toContain("<!-- BEGIN app/views/posts/show.html.tse -->");
    expect(code).not.toContain("/srv/app/");
  });

  it("answers the identifier when Trails is undefined", () => {
    TopLevel.Trails = undefined;
    expect(newTemplate().shortIdentifier).toBe("/srv/app/app/views/posts/show.html.tse");
  });
});
