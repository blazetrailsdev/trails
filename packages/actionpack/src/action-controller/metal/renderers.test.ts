import { afterEach, beforeEach, describe, expect, it, test } from "vitest";

import { include } from "@blazetrails/activesupport";
import { addRenderer, removeRenderer, Renderers, type RenderersHost } from "./renderers.js";

class Host {
  contentType = null;
  mediaType = undefined;
  declare _renderToBodyWithRenderer: RenderersHost["_renderToBodyWithRenderer"];
  _processOptions() {}
}
include(Host, Renderers.All);

describe("Renderers", () => {
  const host = new Host();
  const keysToCleanup: string[] = [];

  afterEach(() => {
    while (keysToCleanup.length) Renderers.remove(keysToCleanup.pop()!);
  });

  test("_renderWithRendererMethodName uses Rails convention", () => {
    expect(Renderers._renderWithRendererMethodName("csv")).toBe("_render_with_renderer_csv");
    expect(Renderers._renderWithRendererMethodName("json")).toBe("_render_with_renderer_json");
  });

  test("_renderToBodyWithRenderer ignores prototype keys (Hash#key? semantics)", () => {
    keysToCleanup.push("toString");
    Renderers.add("toString", () => "should-not-run");
    expect(host._renderToBodyWithRenderer({})).toBeNull();
  });

  test("add registers a renderer that dispatches by key", () => {
    keysToCleanup.push("csv");
    Renderers.add("csv", (value) => `csv:${String(value)}`);

    expect(Renderers.RENDERERS.has("csv")).toBe(true);
    expect(Renderers.isMethodDefined("_render_with_renderer_csv")).toBe(true);
  });

  test("_renderToBodyWithRenderer dispatches to the matching renderer", () => {
    keysToCleanup.push("csv");
    Renderers.add("csv", (value, opts) => `csv:${String(value)}:${String(opts.filename)}`);

    const result = host._renderToBodyWithRenderer({ csv: "data", filename: "out" });
    expect(result).toBe("csv:data:out");
  });

  test("_renderToBodyWithRenderer returns null when no key matches", () => {
    expect(host._renderToBodyWithRenderer({ html: "x" })).toBeNull();
  });

  test("remove deregisters both the key and the dispatch method", () => {
    Renderers.add("xyz", () => "x");
    Renderers.remove("xyz");

    expect(Renderers.RENDERERS.has("xyz")).toBe(false);
    expect(Renderers.isMethodDefined("_render_with_renderer_xyz")).toBe(false);
    expect(host._renderToBodyWithRenderer({ xyz: "v" })).toBeNull();
  });
});

describe("ActionController.addRenderer / removeRenderer", () => {
  const KEY = "test-shim-format";
  beforeEach(() => {
    Renderers.remove(KEY);
  });
  afterEach(() => {
    Renderers.remove(KEY);
  });

  it("addRenderer registers via Renderers.add", () => {
    const block = (value: unknown) => String(value);
    addRenderer(KEY, block);
    expect(Renderers.RENDERERS.has(KEY)).toBe(true);
    expect(Renderers.instanceMethod(`_render_with_renderer_${KEY}`)!.value).toBe(block);
  });

  it("removeRenderer deregisters via Renderers.remove", () => {
    addRenderer(KEY, () => "");
    removeRenderer(KEY);
    expect(Renderers.RENDERERS.has(KEY)).toBe(false);
    expect(Renderers.isMethodDefined(`_render_with_renderer_${KEY}`)).toBe(false);
  });
});
