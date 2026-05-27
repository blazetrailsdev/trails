import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StreamingTemplateRenderer, StreamingBody } from "./streaming-template-renderer.js";
import { Renderer } from "./renderer.js";
import { LookupContext } from "../lookup-context.js";
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

async function collectChunks(gen: AsyncGenerator<string>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of gen) {
    chunks.push(chunk);
  }
  return chunks;
}

describe("StreamingTemplateRenderer", () => {
  let lc: LookupContext;

  beforeEach(() => {
    lc = makeLookupContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("render_template (streaming)", () => {
    it("renders without layout — yields a single chunk", async () => {
      const fake = makeFakeTemplate("Hello streaming");
      vi.spyOn(lc, "findTemplate").mockReturnValue(fake as never);
      const renderer = new StreamingTemplateRenderer(lc);
      const chunks = await collectChunks(renderer.renderStream(ctx, { template: "posts/show" }));
      expect(chunks).toEqual(["Hello streaming"]);
    });

    it("renders with layout — yields prefix, template body, suffix as separate chunks", async () => {
      const templateFake = makeFakeTemplate("inner content");
      vi.spyOn(lc, "findTemplate").mockReturnValue(templateFake as never);

      const layoutFake: RenderableTemplate = {
        identifier: "layout",
        format: "html",
        render: vi.fn().mockImplementation((_locals: unknown, viewCtx: ViewContext) => {
          const yieldContent = viewCtx?._layoutFor?.() ?? "";
          return Promise.resolve(`<header>HEAD</header>${yieldContent}<footer>FOOT</footer>`);
        }),
      };
      vi.spyOn(lc, "findLayout").mockReturnValue(layoutFake as never);

      const renderer = new StreamingTemplateRenderer(lc);
      const chunks = await collectChunks(
        renderer.renderStream(ctx, { template: "posts/show", layout: "application" }),
      );

      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toBe("<header>HEAD</header>");
      expect(chunks[1]).toBe("inner content");
      expect(chunks[2]).toBe("<footer>FOOT</footer>");
    });

    it("renders with layout — joined chunks equal fully rendered page", async () => {
      const templateFake = makeFakeTemplate("inner content");
      vi.spyOn(lc, "findTemplate").mockReturnValue(templateFake as never);

      const layoutFake: RenderableTemplate = {
        identifier: "layout",
        format: "html",
        render: vi.fn().mockImplementation((_locals: unknown, viewCtx: ViewContext) => {
          const yieldContent = viewCtx?._layoutFor?.() ?? "";
          return Promise.resolve(`<header>HEAD</header>${yieldContent}<footer>FOOT</footer>`);
        }),
      };
      vi.spyOn(lc, "findLayout").mockReturnValue(layoutFake as never);

      const renderer = new StreamingTemplateRenderer(lc);
      const chunks = await collectChunks(
        renderer.renderStream(ctx, { template: "posts/show", layout: "application" }),
      );
      expect(chunks.join("")).toBe("<header>HEAD</header>inner content<footer>FOOT</footer>");
    });

    it("renders layout that never yields — appends template body after layout", async () => {
      const templateFake = makeFakeTemplate("template body");
      vi.spyOn(lc, "findTemplate").mockReturnValue(templateFake as never);

      const layoutFake: RenderableTemplate = {
        identifier: "layout",
        format: "html",
        render: vi.fn().mockResolvedValue("<wrapper>no yield here</wrapper>"),
      };
      vi.spyOn(lc, "findLayout").mockReturnValue(layoutFake as never);

      const renderer = new StreamingTemplateRenderer(lc);
      const chunks = await collectChunks(
        renderer.renderStream(ctx, { template: "posts/show", layout: "application" }),
      );
      expect(chunks.join("")).toBe("<wrapper>no yield here</wrapper>template body");
    });

    it("handles error mid-render — yields completion sentinel and does not throw", async () => {
      vi.spyOn(lc, "findTemplate").mockReturnValue({
        identifier: "bad",
        format: "html",
        render: vi.fn().mockRejectedValue(new Error("render boom")),
      } as never);

      const renderer = new StreamingTemplateRenderer(lc);
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const chunks = await collectChunks(renderer.renderStream(ctx, { template: "posts/show" }));

      // Rails: streaming_completion_on_exception — empty string in this port
      expect(chunks).toEqual([""]);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe("StreamingBody", () => {
    it("each() yields chunks", async () => {
      const fake = makeFakeTemplate("chunk content");
      vi.spyOn(lc, "findTemplate").mockReturnValue(fake as never);
      const body = new StreamingBody(lc, ctx, { template: "posts/show" });
      const chunks = await collectChunks(body.each());
      expect(chunks).toEqual(["chunk content"]);
    });

    it("toArray() collects all chunks", async () => {
      const fake = makeFakeTemplate("collected");
      vi.spyOn(lc, "findTemplate").mockReturnValue(fake as never);
      const body = new StreamingBody(lc, ctx, { template: "posts/show" });
      expect(await body.toArray()).toEqual(["collected"]);
    });
  });

  describe("Renderer#renderBody with stream: true", () => {
    it("routes to streaming renderer and returns chunks array", async () => {
      const lc2 = makeLookupContext();
      const fake = makeFakeTemplate("streamed body");
      vi.spyOn(lc2, "findTemplate").mockReturnValue(fake as never);
      const renderer = new Renderer(lc2);
      const chunks = await renderer.renderBody(ctx, { template: "posts/show", stream: true });
      expect(chunks).toEqual(["streamed body"]);
    });
  });
});
