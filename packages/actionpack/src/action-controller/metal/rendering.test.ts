import { describe, expect, test } from "vitest";
import { statusCode } from "@blazetrails/rack";
import {
  _normalizeOptions,
  _normalizeText,
  _processOptions,
  _processVariant,
  _renderInPriorities,
  _setHtmlContentType,
  _setRenderedContentType,
  _setVaryHeader,
  Rendering,
  RENDER_FORMATS_IN_PRIORITY,
} from "./rendering.js";
import { include } from "@blazetrails/activesupport";
import {
  DoubleRenderError,
  _normalizeArgs,
  _normalizeRender,
  render,
  renderToString,
} from "../../abstract-controller/rendering.js";

function including<T extends object>(parent: T): Record<string, any> {
  class Host {}
  Object.setPrototypeOf(Host.prototype, parent);
  include(Host, Rendering);
  return new Host();
}

const normalizeRender = {
  _normalizeRender,
  _normalizeArgs,
  _processVariant: () => {},
  _normalizeOptions: (options: Record<string, unknown>) => options,
  render,
  renderToString,
};

const normalizeOptions = (options: Record<string, unknown>): Record<string, unknown> =>
  including(normalizeRender)._normalizeOptions(options);
const renderToBody = (options: Record<string, unknown>): unknown =>
  including({ renderToBody: () => undefined }).renderToBody(options);

describe("_renderInPriorities", () => {
  test("returns first present priority key, ignoring prototype chain", () => {
    expect(_renderInPriorities({ body: "b", plain: "p", html: "h" })).toBe("b");
    expect(_renderInPriorities({ plain: "p", html: "h" })).toBe("p");
    expect(_renderInPriorities({ html: "h" })).toBe("h");
    expect(_renderInPriorities({ json: "{}" })).toBeNull();
    expect(_renderInPriorities(Object.create({ body: "inherited" }))).toBeNull();
    expect([...RENDER_FORMATS_IN_PRIORITY]).toEqual(["body", "plain", "html"]);
  });
});

describe("_normalizeText", () => {
  test("calls toText() on priority option values that respond", () => {
    const options: Record<string, unknown> = {
      plain: { toText: () => "from-toText" },
      html: 5,
    };
    _normalizeText(options);
    expect(options.plain).toBe("from-toText");
    expect(options.html).toBe(5);
  });
});

describe("_normalizeOptions", () => {
  test("html-escapes :html, resolves symbolic status, runs _normalize_text first", () => {
    const out = normalizeOptions({
      html: "<b>&\"'</b>",
      status: "not_found",
      plain: { toText: () => "<plain>" },
    });
    expect(String(out.html)).toBe("&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;");
    expect(out.status).toBe(404);
    expect(out.plain).toBe("<plain>");
  });

  test("Ruby-truthy gate: '' and 0 are processed, null/false skip", () => {
    expect(String(normalizeOptions({ html: "" }).html)).toBe("");
    expect(normalizeOptions({ status: 0 }).status).toBe(0);
    expect(normalizeOptions({ html: null }).html).toBeNull();
    expect(normalizeOptions({ status: false }).status).toBe(false);
  });
});

describe("_processVariant", () => {
  test("copies present variant onto options; ignores absent/empty", () => {
    const opts: Record<string, unknown> = {};
    _processVariant.call({ request: { variant: Symbol.for("mobile") } }, opts);
    expect(opts.variant).toBe(Symbol.for("mobile"));

    const opts2: Record<string, unknown> = {};
    _processVariant.call({ request: { variant: undefined } }, opts2);
    _processVariant.call({ request: { variant: [] } }, opts2);
    _processVariant.call({}, opts2);
    expect(opts2).toEqual({});
  });
});

describe("_setHtmlContentType", () => {
  test("assigns text/html to the host content type", () => {
    const host = { contentType: null as string | null };
    _setHtmlContentType.call(host);
    expect(host.contentType).toBe("text/html");
  });
});

describe("_setRenderedContentType", () => {
  test("assigns format only when response has no media type and format is truthy", () => {
    const host = (responseCt?: string) => ({
      contentType: null as string | null,
      response: { mediaType: responseCt },
    });

    const a = host();
    _setRenderedContentType.call(a, "text/csv");
    expect(a.contentType).toBe("text/csv");

    const b = host("application/json");
    _setRenderedContentType.call(b, "text/csv");
    expect(b.contentType).toBeNull();

    const c = host();
    _setRenderedContentType.call(c, null);
    expect(c.contentType).toBeNull();
  });
});

describe("_setVaryHeader", () => {
  function makeHost(initial?: string, shouldApply = true) {
    const headers = new Map<string, string>();
    if (initial !== undefined) headers.set("vary", initial);
    return {
      headers,
      host: {
        request: { shouldApplyVaryHeader: () => shouldApply },
        response: {
          getHeader: (n: string) => headers.get(n.toLowerCase()),
          setHeader: (n: string, v: string) => headers.set(n.toLowerCase(), v),
        },
      },
    };
  }

  test("sets Vary: Accept when missing and request opts in; preserves existing or opt-out", () => {
    const a = makeHost();
    _setVaryHeader.call(a.host);
    expect(a.headers.get("vary")).toBe("Accept");

    const b = makeHost("Cookie");
    _setVaryHeader.call(b.host);
    expect(b.headers.get("vary")).toBe("Cookie");

    const c = makeHost(undefined, false);
    _setVaryHeader.call(c.host);
    expect(c.headers.has("vary")).toBe(false);
  });
});

describe("_processOptions", () => {
  test("applies status / contentType / location, ignoring missing keys", () => {
    const setHeaderCalls: Array<[string, string]> = [];
    const host = including({
      _processOptions() {},
      _status: 200,
      get status(): number {
        return this._status;
      },
      set status(value: number | string) {
        this._status = statusCode(value);
      },
      contentType: null as string | null,
      headers: { set: (n: string, v: string) => setHeaderCalls.push([n, v]) },
      urlFor: (s: string) => `/url/${s}`,
    });
    host._processOptions({
      status: "created",
      contentType: "text/plain",
      location: "post-1",
    });
    expect(host.status).toBe(201);
    expect(host.contentType).toBe("text/plain");
    expect(setHeaderCalls).toEqual([["Location", "/url/post-1"]]);

    host._processOptions({});
    expect(host.status).toBe(201);
  });

  test("Ruby-truthy gate: '' / 0 are applied, null/false skip", () => {
    const host = including({
      _processOptions() {},
      status: 200,
      contentType: null as string | null,
      headers: { set: () => undefined },
      urlFor: (s: string) => s,
    });
    host._processOptions({ status: 0, contentType: "" });
    expect(host.status).toBe(0);
    expect(host.contentType).toBe("");

    host.status = 200;
    host.contentType = null;
    host._processOptions({ status: null, contentType: false });
    expect(host.status).toBe(200);
    expect(host.contentType).toBeNull();
  });
});

describe("Metal wiring", () => {
  test("exposes the rendering privates as static members", async () => {
    const { Metal } = await import("../metal.js");
    expect(Metal._renderInPriorities).toBe(_renderInPriorities);
    expect(Metal._normalizeText).toBe(_normalizeText);
    expect(Metal._normalizeOptions).toBe(_normalizeOptions);
    expect(Rendering.instanceMethod("_processOptions")!.value).toBe(_processOptions);
    expect(Metal._setHtmlContentType).toBe(_setHtmlContentType);
    expect(Metal._setRenderedContentType).toBe(_setRenderedContentType);
    expect(Metal._setVaryHeader).toBe(_setVaryHeader);
    expect(Metal._processOptions).toBe(_processOptions);
  });

  test("renderToBody routes through _renderInPriorities and falls back to ' '", () => {
    expect(renderToBody({ body: "hi" })).toBe("hi");
    expect(renderToBody({ plain: "p", html: "h" })).toBe("p");
    expect(renderToBody({ html: "h" })).toBe("h");
    expect(renderToBody({})).toBe(" ");
    expect(renderToBody({ json: "{}" })).toBe(" ");
  });

  test("renderToBody preserves '' / 0 (Ruby-truthy) and falls through on false/null", () => {
    expect(renderToBody({ body: "" })).toBe("");
    expect(renderToBody({ plain: 0 })).toBe(0);
    expect(renderToBody({ body: false })).toBe(" ");
    expect(renderToBody({ body: null })).toBe(" ");
  });

  test("render throws DoubleRenderError when performed is already set", () => {
    const host = including({
      performed: true,
      responseBody: "ignored",
      renderToBody: () => "ignored",
      ...normalizeRender,
    });
    expect(() => host.render()).toThrow(DoubleRenderError);
  });

  test("render delegates to abstract render when not yet performed", () => {
    const host = including({
      response: { getHeader: () => undefined, setHeader() {} },
      performed: false,
      responseBody: null as unknown,
      renderToBody: (opts: Record<string, unknown>) => `body:${String(opts.plain ?? "")}`,
      _setHtmlContentType: () => {},
      _setRenderedContentType: () => {},
      _setVaryHeader: () => {},
      renderedFormat: () => null,
      ...normalizeRender,
    });
    host.render({ plain: "hi" });
    expect(host.responseBody).toBe("body:hi");
  });

  test("renderToString collapses iterable results into a string", () => {
    const host = including({
      responseBody: null as unknown,
      renderToBody: () => ["a", "b", "c"],
      ...normalizeRender,
    });
    expect(host.renderToString({})).toBe("abc");
  });

  test("renderToString passes non-iterable results through unchanged", () => {
    const host = including({
      responseBody: null as unknown,
      renderToBody: () => 42,
      ...normalizeRender,
    });
    expect(host.renderToString({})).toBe(42);
  });

  test("processAction sets formats from request.formats via ref()", () => {
    const host = including({
      processAction() {},
      request: {
        formats: [{ ref: () => "html" }, { ref: () => "json" }],
      },
    });
    host.processAction();
    expect(host.formats).toEqual(["html", "json"]);
  });

  test("processAction filters out null refs (filter_map &:ref parity)", () => {
    const host = including({
      processAction() {},
      request: {
        formats: [{ ref: () => "html" }, { ref: () => null }, { ref: () => "json" }],
      },
    });
    host.processAction();
    expect(host.formats).toEqual(["html", "json"]);
  });
});
