import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { Base } from "../base.js";
import { Body, StreamingTemplateRenderer } from "./streaming-template-renderer.js";
import { Renderer } from "./renderer.js";
import { LookupContext } from "../lookup-context.js";
import type { RenderableTemplate, ViewContext } from "./abstract-renderer.js";

function makeFakeTemplate(body: string, format = ":html"): RenderableTemplate {
  return {
    identifier: "fake",
    format,
    supportsStreaming: () => true,
    render: vi.fn().mockResolvedValue(body),
  };
}

function makeLookupContext(): LookupContext {
  return new LookupContext();
}

const ctx: ViewContext = { viewRenderer: { cacheHits: {} } };

async function collectChunks(
  body: Body | (string | null)[] | Promise<Body | (string | null)[]>,
): Promise<(string | null)[]> {
  const resolved = await body;
  if (Array.isArray(resolved)) return resolved;
  const chunks: string[] = [];
  await resolved.each((chunk) => chunks.push(chunk));
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
      const chunks = await collectChunks(renderer.render(ctx, { template: "posts/show" }));
      expect(chunks).toEqual(["Hello streaming"]);
    });

    it("renders with layout — yields prefix, template body, suffix as separate chunks", async () => {
      const templateFake = makeFakeTemplate("inner content");
      vi.spyOn(lc, "findTemplate").mockReturnValue(templateFake as never);

      const layoutFake: RenderableTemplate = {
        identifier: "layout",
        format: ":html",
        render: vi.fn().mockImplementation((viewCtx: ViewContext) => {
          const yieldContent = viewCtx?._layoutFor?.() ?? "";
          return Promise.resolve(`<header>HEAD</header>${yieldContent}<footer>FOOT</footer>`);
        }),
      };
      vi.spyOn(lc, "find").mockReturnValue(layoutFake as never);

      const renderer = new StreamingTemplateRenderer(lc);
      const chunks = await collectChunks(
        renderer.render(ctx, { template: "posts/show", layout: "application" }),
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
        format: ":html",
        render: vi.fn().mockImplementation((viewCtx: ViewContext) => {
          const yieldContent = viewCtx?._layoutFor?.() ?? "";
          return Promise.resolve(`<header>HEAD</header>${yieldContent}<footer>FOOT</footer>`);
        }),
      };
      vi.spyOn(lc, "find").mockReturnValue(layoutFake as never);

      const renderer = new StreamingTemplateRenderer(lc);
      const chunks = await collectChunks(
        renderer.render(ctx, { template: "posts/show", layout: "application" }),
      );
      expect(chunks.join("")).toBe("<header>HEAD</header>inner content<footer>FOOT</footer>");
    });

    it("renders layout that never yields — appends template body after layout", async () => {
      const templateFake = makeFakeTemplate("template body");
      vi.spyOn(lc, "findTemplate").mockReturnValue(templateFake as never);

      const layoutFake: RenderableTemplate = {
        identifier: "layout",
        format: ":html",
        render: vi.fn().mockResolvedValue("<wrapper>no yield here</wrapper>"),
      };
      vi.spyOn(lc, "find").mockReturnValue(layoutFake as never);

      const renderer = new StreamingTemplateRenderer(lc);
      const chunks = await collectChunks(
        renderer.render(ctx, { template: "posts/show", layout: "application" }),
      );
      expect(chunks.join("")).toBe("<wrapper>no yield here</wrapper>template body");
    });

    it("instruments the whole streamed render as render_template.action_view", async () => {
      const events: Array<Record<string, unknown>> = [];
      const subscriber = Notifications.subscribe(
        "render_template.action_view",
        (event: { payload: Record<string, unknown> }) => events.push(event.payload),
      );
      try {
        const templateFake = makeFakeTemplate("inner content");
        vi.spyOn(lc, "findTemplate").mockReturnValue(templateFake as never);

        const layoutFake: RenderableTemplate = {
          identifier: "layout",
          virtualPath: "layouts/application",
          format: ":html",
          render: vi.fn().mockImplementation((viewCtx: ViewContext) => {
            const yieldContent = viewCtx?._layoutFor?.() ?? "";
            return Promise.resolve(`<header>${yieldContent}</header>`);
          }),
        };
        vi.spyOn(lc, "find").mockReturnValue(layoutFake as never);

        const renderer = new StreamingTemplateRenderer(lc);
        await collectChunks(
          renderer.render(ctx, { template: "posts/show", layout: "application" }),
        );

        expect(events).toHaveLength(1);
        expect(events[0].identifier).toBe("fake");
        expect(events[0].layout).toBe("layouts/application");
      } finally {
        Notifications.unsubscribe(subscriber);
      }
    });

    it("instruments the no-layout branch when the named layout does not resolve", async () => {
      const events: Array<Record<string, unknown>> = [];
      const subscriber = Notifications.subscribe(
        "render_template.action_view",
        (event: { payload: Record<string, unknown> }) => events.push(event.payload),
      );
      try {
        const templateFake = makeFakeTemplate("bare body");
        vi.spyOn(lc, "findTemplate").mockReturnValue(templateFake as never);
        vi.spyOn(lc, "findAll").mockReturnValue([] as never);
        vi.spyOn(lc, "find").mockReturnValue(null as never);

        const renderer = new StreamingTemplateRenderer(lc);
        const chunks = await collectChunks(
          renderer.render(ctx, { template: "posts/show", layout: "application" }),
        );

        expect(chunks).toEqual(["bare body"]);
        expect(events).toHaveLength(1);
        expect(events[0].layout).toBe(null);
        expect(events[0].identifier).toBe("fake");
      } finally {
        Notifications.unsubscribe(subscriber);
      }
    });

    it("records exception and exception_object on the payload when the render raises", async () => {
      const events: Array<Record<string, unknown>> = [];
      const subscriber = Notifications.subscribe(
        "render_template.action_view",
        (event: { payload: Record<string, unknown> }) => events.push(event.payload),
      );
      try {
        const boom = new Error("kaboom");
        boom.name = "ActionView::Template::Error";
        const templateFake: RenderableTemplate = {
          identifier: "fake",
          format: ":html",
          supportsStreaming: () => true,
          render: vi.fn().mockRejectedValue(boom),
        };
        vi.spyOn(lc, "findTemplate").mockReturnValue(templateFake as never);
        vi.spyOn(lc, "findAll").mockReturnValue([] as never);
        vi.spyOn(lc, "find").mockReturnValue(null as never);

        const renderer = new StreamingTemplateRenderer(lc);
        await collectChunks(
          renderer.render(ctx, { template: "posts/show", layout: "application" }),
        );

        expect(events).toHaveLength(1);
        expect(events[0].exception).toEqual(["ActionView::Template::Error", "kaboom"]);
        expect(events[0].exception_object).toBe(boom);
      } finally {
        Notifications.unsubscribe(subscriber);
      }
    });

    it("handles error mid-render — yields completion sentinel and does not throw", async () => {
      vi.spyOn(lc, "findTemplate").mockReturnValue({
        identifier: "bad",
        format: ":html",
        supportsStreaming: () => true,
        render: vi.fn().mockRejectedValue(new Error("render boom")),
      } as never);
      vi.spyOn(lc, "find").mockReturnValue(null as never);

      const fatal = vi.fn();
      const oldLogger = Base.logger;
      Base.logger = { fatal };
      try {
        const renderer = new StreamingTemplateRenderer(lc);
        const chunks = await collectChunks(
          renderer.render(ctx, { template: "posts/show", layout: "application" }),
        );

        expect(chunks).toEqual([Base.streamingCompletionOnException]);
        expect(fatal).toHaveBeenCalledWith(expect.stringContaining("Error (render boom):"));
      } finally {
        Base.logger = oldLogger;
      }
    });

    it("falls back to the non-streaming render when the handler does not support streaming", async () => {
      const templateFake: RenderableTemplate = {
        ...makeFakeTemplate("inner content"),
        supportsStreaming: () => false,
      };
      vi.spyOn(lc, "findTemplate").mockReturnValue(templateFake as never);

      const flow = new Map<string, string>();
      const view: ViewContext = { ...ctx, viewFlow: { set: (k, v) => void flow.set(k, v) } };
      const layoutFake: RenderableTemplate = {
        identifier: "layout",
        format: ":html",
        render: vi
          .fn()
          .mockImplementation(() =>
            Promise.resolve(`<header>HEAD</header>${flow.get("layout")}<footer>FOOT</footer>`),
          ),
      };
      vi.spyOn(lc, "find").mockReturnValue(layoutFake as never);

      const renderer = new StreamingTemplateRenderer(lc);
      const chunks = await collectChunks(
        renderer.render(view, { template: "posts/show", layout: "application" }),
      );

      expect(chunks).toEqual(["<header>HEAD</header>inner content<footer>FOOT</footer>"]);
    });

    it("determines the template from options other than template:", async () => {
      const renderer = new StreamingTemplateRenderer(lc);

      expect(await renderer.render(ctx, { plain: "plain body" })).toEqual(["plain body"]);
    });
  });

  describe("Body", () => {
    it("each() hands every chunk the start block writes to the block", async () => {
      const body = new Body(async (buffer) => {
        buffer("chunk ");
        buffer("content");
      });
      expect(await collectChunks(body)).toEqual(["chunk ", "content"]);
    });
  });

  describe("Renderer#renderBody", () => {
    it("routes to streaming renderer and returns chunks array", async () => {
      const lc2 = makeLookupContext();
      const fake = makeFakeTemplate("streamed body");
      vi.spyOn(lc2, "findTemplate").mockReturnValue(fake as never);
      const renderer = new Renderer(lc2);
      const chunks = await renderer.renderBody(ctx, { template: "posts/show" });
      expect(chunks).toEqual(["streamed body"]);
    });
  });
});
