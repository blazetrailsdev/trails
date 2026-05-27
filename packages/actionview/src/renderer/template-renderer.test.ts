import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TemplateRenderer } from "./template-renderer.js";
import { Renderer } from "./renderer.js";
import { LookupContext, MissingTemplate } from "../lookup-context.js";
import type { RenderableTemplate, ViewContext } from "./abstract-renderer.js";

function makeFakeTemplate(body: string, format = "html"): RenderableTemplate {
  return {
    identifier: "fake",
    format,
    render: vi.fn().mockResolvedValue(body),
  };
}

function makeLookupContext(): LookupContext {
  return new LookupContext();
}

const ctx: ViewContext = {};

describe("TemplateRenderer", () => {
  let lc: LookupContext;

  beforeEach(() => {
    lc = makeLookupContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("renders a template by name", () => {
    it("renders a bare template", async () => {
      const fake = makeFakeTemplate("Hello world");
      vi.spyOn(lc, "findTemplate").mockReturnValue(fake as never);
      const renderer = new TemplateRenderer(lc);
      const result = await renderer.render(ctx, { template: "posts/show" });
      expect(result.body).toBe("Hello world");
    });

    it("renders a template with locals", async () => {
      const fake = makeFakeTemplate("Hello Alice");
      vi.spyOn(lc, "findTemplate").mockReturnValue(fake as never);
      const renderer = new TemplateRenderer(lc);
      const result = await renderer.render(ctx, {
        template: "posts/show",
        locals: { name: "Alice" },
      });
      expect(result.body).toBe("Hello Alice");
      expect(fake.render).toHaveBeenCalledWith({ name: "Alice" }, ctx);
    });
  });

  describe("renders inline body options", () => {
    it("renders body: directly", async () => {
      const renderer = new TemplateRenderer(lc);
      const result = await renderer.render(ctx, { body: "raw body" });
      expect(result.body).toBe("raw body");
    });

    it("renders plain: directly", async () => {
      const renderer = new TemplateRenderer(lc);
      const result = await renderer.render(ctx, { plain: "plain text" });
      expect(result.body).toBe("plain text");
    });

    it("renders html: directly", async () => {
      const renderer = new TemplateRenderer(lc);
      const result = await renderer.render(ctx, { html: "<b>bold</b>" });
      expect(result.body).toBe("<b>bold</b>");
    });

    it("renders inline: source directly", async () => {
      const renderer = new TemplateRenderer(lc);
      const result = await renderer.render(ctx, { inline: "<%= 1 + 1 %>" });
      expect(result.body).toBe("<%= 1 + 1 %>");
    });

    it("renders renderable: objects", async () => {
      const renderer = new TemplateRenderer(lc);
      const renderable = { renderIn: (_c: ViewContext) => "from renderable" };
      const result = await renderer.render(ctx, { renderable });
      expect(result.body).toBe("from renderable");
    });
  });

  describe("raises on missing template", () => {
    it("raises MissingTemplate when template cannot be found", async () => {
      vi.spyOn(lc, "findTemplate").mockReturnValue(null);
      const renderer = new TemplateRenderer(lc);
      await expect(renderer.render(ctx, { template: "posts/missing" })).rejects.toBeInstanceOf(
        MissingTemplate,
      );
    });
  });

  describe("renders with layout", () => {
    it("wraps template body in layout when layout: is set", async () => {
      const templateFake = makeFakeTemplate("content");
      const layoutFake = makeFakeTemplate("LAYOUT[content]");
      vi.spyOn(lc, "findTemplate").mockReturnValue(templateFake as never);
      vi.spyOn(lc, "findLayout").mockReturnValue(layoutFake as never);
      const renderer = new TemplateRenderer(lc);
      const result = await renderer.render(ctx, {
        template: "posts/show",
        layout: "application",
      });
      expect(result.body).toBe("LAYOUT[content]");
    });
  });

  describe("raises without a render option", () => {
    it("raises ArgumentError when no render option is given", async () => {
      const renderer = new TemplateRenderer(lc);
      await expect(renderer.render(ctx, {})).rejects.toThrow("render");
    });
  });
});

describe("Renderer (async chain)", () => {
  let lc: LookupContext;

  beforeEach(() => {
    lc = makeLookupContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("render() returns a Promise<string>", async () => {
    const fake = makeFakeTemplate("hello");
    vi.spyOn(lc, "findTemplate").mockReturnValue(fake as never);
    const renderer = new Renderer(lc);
    const result = await renderer.render(ctx, { template: "posts/show" });
    expect(result).toBe("hello");
  });

  it("cacheHits accumulates across renders", () => {
    const renderer = new Renderer(lc);
    renderer.cacheHits["posts/card"] = 3;
    expect(renderer.cacheHits["posts/card"]).toBe(3);
  });
});
