import { describe, expect, test } from "vitest";
import {
  _normalizeOptions,
  _normalizeText,
  _processOptions,
  _processVariant,
  _renderInPriorities,
  _setHtmlContentType,
  _setRenderedContentType,
  _setVaryHeader,
  RENDER_FORMATS_IN_PRIORITY,
} from "./rendering.js";

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
    const out = _normalizeOptions({
      html: "<b>&\"'</b>",
      status: "not_found",
      plain: { toText: () => "<plain>" },
    });
    expect(String(out.html)).toBe("&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;");
    expect(out.status).toBe(404);
    expect(out.plain).toBe("<plain>");
  });

  test("Ruby-truthy gate: '' and 0 are processed, null/false skip", () => {
    // `html: ""` is Ruby-truthy → html-escape runs and returns a SafeBuffer
    // wrapping "" (still truthy / present, just escaped).
    expect(String(_normalizeOptions({ html: "" }).html)).toBe("");
    // `status: 0` is Ruby-truthy → resolveStatus passes the number through.
    expect(_normalizeOptions({ status: 0 }).status).toBe(0);
    // `null`/`false` skip → fields untouched.
    expect(_normalizeOptions({ html: null }).html).toBeNull();
    expect(_normalizeOptions({ status: false }).status).toBe(false);
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
      response: { contentType: responseCt },
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
    const host = {
      status: 200,
      contentType: null as string | null,
      setHeader: (n: string, v: string) => setHeaderCalls.push([n, v]),
      urlFor: (s: string) => `/url/${s}`,
    };
    _processOptions.call(host, {
      status: "created",
      contentType: "text/plain",
      location: "post-1",
    });
    expect(host.status).toBe(201);
    expect(host.contentType).toBe("text/plain");
    expect(setHeaderCalls).toEqual([["Location", "/url/post-1"]]);

    _processOptions.call(host, {});
    expect(host.status).toBe(201);
  });

  test("Ruby-truthy gate: '' / 0 are applied, null/false skip", () => {
    const host = {
      status: 200,
      contentType: null as string | null,
      setHeader: () => undefined,
      urlFor: (s: string) => s,
    };
    _processOptions.call(host, { status: 0, contentType: "" });
    expect(host.status).toBe(0);
    expect(host.contentType).toBe("");

    host.status = 200;
    host.contentType = null;
    _processOptions.call(host, { status: null, contentType: false });
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
    expect(Metal._processVariant).toBe(_processVariant);
    expect(Metal._setHtmlContentType).toBe(_setHtmlContentType);
    expect(Metal._setRenderedContentType).toBe(_setRenderedContentType);
    expect(Metal._setVaryHeader).toBe(_setVaryHeader);
    expect(Metal._processOptions).toBe(_processOptions);
  });

  test("renderToBody routes through _renderInPriorities and falls back to ' '", async () => {
    const { Metal } = await import("../metal.js");
    const instance = Object.create(Metal.prototype) as InstanceType<typeof Metal>;
    expect(instance.renderToBody({ body: "hi" })).toBe("hi");
    expect(instance.renderToBody({ plain: "p", html: "h" })).toBe("p");
    expect(instance.renderToBody({ html: "h" })).toBe("h");
    expect(instance.renderToBody({})).toBe(" ");
    expect(instance.renderToBody({ json: "{}" })).toBe(" ");
  });

  test("renderToBody preserves '' / 0 (Ruby-truthy) and falls through on false/null", async () => {
    const { Metal } = await import("../metal.js");
    const instance = Object.create(Metal.prototype) as InstanceType<typeof Metal>;
    // Ruby `""` and `0` are truthy; Rails `super || _render_in_priorities || " "`
    // returns them as-is rather than falling through.
    expect(instance.renderToBody({ body: "" })).toBe("");
    expect(instance.renderToBody({ plain: 0 })).toBe(0);
    // Ruby `false`/`nil` fall through; `_renderInPriorities` returns null
    // when no key matches, so the " " fallback wins.
    expect(instance.renderToBody({ body: false })).toBe(" ");
    expect(instance.renderToBody({ body: null })).toBe(" ");
  });

  test("renderToBody dispatches to a registered renderer before the priority resolver", async () => {
    const { Metal } = await import("../metal.js");
    const { Renderers } = await import("../metal/renderers.js");
    Renderers.add("csvBody", (v) => `csv:${String(v)}`);
    try {
      const instance = Object.create(Metal.prototype) as InstanceType<typeof Metal>;
      expect(instance.renderToBody({ csvBody: "a,b" })).toBe("csv:a,b");
    } finally {
      Renderers.remove("csvBody");
    }
  });
});
