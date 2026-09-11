import { afterEach, describe, expect, it, vi } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { TemplateRenderer } from "./template-renderer.js";
import { LookupContext } from "../lookup-context.js";
import { MissingTemplate } from "../template/error.js";
import type { RenderableTemplate, ViewContext } from "./abstract-renderer.js";

const ctx: ViewContext = { viewRenderer: { cacheHits: {} } };

function fakeTemplate(body: string): RenderableTemplate {
  return { identifier: "fake", format: "html", render: vi.fn().mockResolvedValue(body) };
}

describe("TemplateRenderer raises", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("render file with invalid full path", async () => {
    const renderer = new TemplateRenderer(new LookupContext());
    const e = await renderer
      .render(ctx, { file: "/nonexistent/fixtures/test/hello_world_invalid.erb" })
      .catch((err: unknown) => err);
    expect(e).toBeInstanceOf(ArgumentError);
    expect((e as Error).message).toMatch(/File (.+) does not exist/);
  });

  it("render file with relative path", async () => {
    const renderer = new TemplateRenderer(new LookupContext());
    const e = await renderer
      .render(ctx, { file: "fixtures/test/hello_world.erb" })
      .catch((err: unknown) => err);
    expect(e).toBeInstanceOf(ArgumentError);
    expect((e as Error).message).toMatch(
      /`render file:` should be given the absolute path to a file. (.+) was given instead/,
    );
  });

  it("raises ArgumentError for an absolute layout path", async () => {
    const lc = new LookupContext();
    vi.spyOn(lc, "findTemplate").mockReturnValue(fakeTemplate("content") as never);
    const renderer = new TemplateRenderer(lc);
    const e = await renderer
      .render(ctx, { template: "posts/show", layout: "/layouts/application" })
      .catch((err: unknown) => err);
    expect(e).toBeInstanceOf(ArgumentError);
    expect((e as Error).message).toBe("Rendering layouts from an absolute path is not supported.");
  });

  it("re-raises MissingTemplate when the layout does not exist in any format", async () => {
    const lc = new LookupContext();
    vi.spyOn(lc, "findTemplate").mockReturnValue(fakeTemplate("content") as never);
    const renderer = new TemplateRenderer(lc);
    const e = await renderer
      .render(ctx, { template: "posts/show", layout: "layouts/missing" })
      .catch((err: unknown) => err);
    expect(e).toBeInstanceOf(MissingTemplate);
  });
});
