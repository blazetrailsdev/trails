import { afterEach, describe, expect, test } from "vitest";

import { Renderers, _renderToBodyWithRenderer } from "./renderers.js";

describe("Renderers", () => {
  const host = { contentType: null, mediaType: undefined, _processOptions() {} };
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
    expect(_renderToBodyWithRenderer.call(host, {})).toBeNull();
  });

  test("add registers a renderer that dispatches by key", () => {
    keysToCleanup.push("csv");
    Renderers.add("csv", (value) => `csv:${String(value)}`);

    expect(Renderers.RENDERERS.has("csv")).toBe(true);
    expect(Renderers.get("csv")).toBeDefined();
  });

  test("_renderToBodyWithRenderer dispatches to the matching renderer", () => {
    keysToCleanup.push("csv");
    Renderers.add("csv", (value, opts) => `csv:${String(value)}:${String(opts.filename)}`);

    const result = _renderToBodyWithRenderer.call(host, { csv: "data", filename: "out" });
    expect(result).toBe("csv:data:out");
  });

  test("_renderToBodyWithRenderer returns null when no key matches", () => {
    expect(_renderToBodyWithRenderer.call(host, { html: "x" })).toBeNull();
  });

  test("remove deregisters both the key and the dispatch method", () => {
    Renderers.add("xyz", () => "x");
    Renderers.remove("xyz");

    expect(Renderers.RENDERERS.has("xyz")).toBe(false);
    expect(Renderers.get("xyz")).toBeUndefined();
    expect(_renderToBodyWithRenderer.call(host, { xyz: "v" })).toBeNull();
  });
});
