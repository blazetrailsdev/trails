import { describe, it, expect, vi } from "vitest";
import {
  DoubleRenderError,
  DEFAULT_PROTECTED_INSTANCE_VARIABLES,
  render,
  renderToString,
  viewAssigns,
  _normalizeArgs,
  _normalizeOptions,
  normalizeRender,
  type RenderOptions,
  type RenderingHost,
} from "./rendering.js";
import { AbstractControllerError } from "./error.js";

function makeHost(opts: Partial<RenderingHost> = {}): RenderingHost {
  return {
    responseBody: null,
    renderToBody: (o: RenderOptions) => (o.html != null ? String(o.html) : "<body>"),
    ...opts,
  };
}

describe("AbstractController::DoubleRenderError", () => {
  it("extends AbstractControllerError", () => {
    expect(new DoubleRenderError()).toBeInstanceOf(AbstractControllerError);
  });

  it("uses the Rails-shaped default message when none is supplied", () => {
    expect(new DoubleRenderError().message).toMatch(
      /Render and\/or redirect were called multiple times/,
    );
  });

  it("preserves a caller-supplied message", () => {
    expect(new DoubleRenderError("custom").message).toBe("custom");
  });
});

describe("render() and renderToString()", () => {
  it("render delegates to renderToBody and writes responseBody", () => {
    const host = makeHost();
    render.call(host);
    expect(host.responseBody).toBe("<body>");
  });

  it("renderToString returns the body without touching responseBody", () => {
    const host = makeHost();
    const out = renderToString.call(host, { template: "x" });
    expect(out).toBe("<body>");
    expect(host.responseBody).toBeNull();
  });

  it("invokes _setHtmlContentType when options.html is supplied", () => {
    const setHtml = vi.fn();
    const setRendered = vi.fn();
    const host = makeHost({
      _setHtmlContentType: setHtml,
      _setRenderedContentType: setRendered,
    });
    render.call(host, { html: "<p>hi</p>" });
    expect(setHtml).toHaveBeenCalledOnce();
    expect(setRendered).not.toHaveBeenCalled();
  });

  it("invokes _setRenderedContentType when options.html is absent", () => {
    const setHtml = vi.fn();
    const setRendered = vi.fn();
    const host = makeHost({
      _setHtmlContentType: setHtml,
      _setRenderedContentType: setRendered,
      renderedFormat: () => "text/plain",
    });
    render.call(host, { template: "x" });
    expect(setHtml).not.toHaveBeenCalled();
    expect(setRendered).toHaveBeenCalledWith("text/plain");
  });

  it("always invokes _setVaryHeader", () => {
    const setVary = vi.fn();
    const host = makeHost({ _setVaryHeader: setVary });
    render.call(host);
    expect(setVary).toHaveBeenCalledOnce();
  });
});

describe("viewAssigns()", () => {
  it("returns non-protected, non-underscore-prefixed own properties", () => {
    const host = {
      title: "Hello",
      count: 3,
      _actionName: "show",
      _internal: "hidden",
    };
    expect(viewAssigns.call(host)).toEqual({ title: "Hello", count: 3 });
  });

  it("excludes all DEFAULT_PROTECTED_INSTANCE_VARIABLES", () => {
    const host: Record<string, unknown> = { title: "ok" };
    for (const name of DEFAULT_PROTECTED_INSTANCE_VARIABLES) host[name] = "no";
    expect(viewAssigns.call(host)).toEqual({ title: "ok" });
  });
});

describe("_normalizeArgs", () => {
  it("returns the second argument when the first is a string template name", () => {
    // Rails uses Symbol but trails treats unknown literals as opaque.
    expect(_normalizeArgs("foo", { layout: "bar" })).toEqual({ layout: "bar" });
  });

  it("returns the first argument when it's already an options hash", () => {
    expect(_normalizeArgs({ template: "x" })).toEqual({ template: "x" });
  });

  it("returns a permitted params-like object directly", () => {
    const params = { permitted: () => true, template: "x" };
    expect(_normalizeArgs(params)).toBe(params);
  });

  it("throws when params-like input is not permitted", () => {
    const params = { permitted: () => false };
    expect(() => _normalizeArgs(params)).toThrow(/not permitted/);
  });
});

describe("normalizeRender", () => {
  it("composes args normalization, variant processing, and options normalization", () => {
    expect(normalizeRender({ template: "x" })).toEqual({ template: "x" });
  });

  it("_normalizeOptions is the identity in the abstract layer", () => {
    const opts = { template: "x" };
    expect(_normalizeOptions(opts)).toBe(opts);
  });
});
