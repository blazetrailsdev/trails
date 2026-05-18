import { afterEach, describe, expect, it } from "vitest";
import { MimeType } from "./mime-type.js";
import { Request } from "./request.js";
import {
  DEFAULT_PARSERS,
  PARAMETERS_KEY,
  ParseError,
  type ParameterParser,
  type ParametersHost,
  logParseErrorOnce,
  parameterParsers,
  parameters,
  paramsParsers,
  parseFormattedParameters,
  pathParameters,
  setParameterParsers,
  setPathParameters,
} from "./parameters.js";

function makeHost(overrides: Partial<ParametersHost> = {}): ParametersHost {
  const headers = new Map<string, unknown>();
  return {
    getHeader: (k) => headers.get(k),
    setHeader: (k, v) => {
      headers.set(k, v);
      return v;
    },
    deleteHeader: (k) => {
      headers.delete(k);
    },
    queryParameters: {},
    requestParameters: {},
    contentLength: 0,
    contentMimeType: null,
    rawPost: "",
    ...overrides,
  };
}

describe("PARAMETERS_KEY", () => {
  it("matches the Rails env key", () => {
    expect(PARAMETERS_KEY).toBe("action_dispatch.request.path_parameters");
  });
});

describe("DEFAULT_PARSERS json", () => {
  const parser = DEFAULT_PARSERS[MimeType.JSON.symbol];

  it("returns hash payloads unchanged", () => {
    expect(parser('{"a":1}')).toEqual({ a: 1 });
  });

  it("wraps non-hash payloads under _json", () => {
    expect(parser("[1,2,3]")).toEqual({ _json: [1, 2, 3] });
    expect(parser("42")).toEqual({ _json: 42 });
    expect(parser("null")).toEqual({ _json: null });
  });
});

describe("ParseError", () => {
  it("is an Error subclass with the Rails-style name", () => {
    const e = new ParseError("boom");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("ActionDispatch::Http::Parameters::ParseError");
    expect(e.message).toBe("boom");
  });
});

describe("parameters", () => {
  it("merges request + query then path parameters", () => {
    const host = makeHost({
      queryParameters: { q: "1", shared: "query" },
      requestParameters: { r: "1", shared: "request" },
    });
    setPathParameters.call(host, { controller: "posts", action: "index" });
    const result = parameters.call(host);
    expect(result).toEqual({
      r: "1",
      shared: "query",
      q: "1",
      controller: "posts",
      action: "index",
    });
  });

  it("caches the merged hash under the env key", () => {
    const host = makeHost({ queryParameters: { a: 1 } });
    const first = parameters.call(host);
    const second = parameters.call(host);
    expect(second).toBe(first);
  });

  it("propagates ParseError from requestParameters (Rails rescues only EOFError)", () => {
    const host = makeHost({ queryParameters: { q: 1 } });
    Object.defineProperty(host, "requestParameters", {
      get() {
        throw new ParseError("bad JSON");
      },
    });
    expect(() => parameters.call(host)).toThrow(ParseError);
  });
});

describe("pathParameters", () => {
  it("returns an empty hash when unset and caches it", () => {
    const host = makeHost();
    const a = pathParameters.call(host);
    const b = pathParameters.call(host);
    expect(a).toEqual({});
    expect(b).toBe(a);
  });
});

describe("setPathParameters", () => {
  it("stores under PARAMETERS_KEY and invalidates the merged cache", () => {
    const host = makeHost({ queryParameters: { q: 1 } });
    parameters.call(host); // populates cache
    setPathParameters.call(host, { controller: "x" });
    expect(host.getHeader(PARAMETERS_KEY)).toEqual({ controller: "x" });
    expect(host.getHeader("action_dispatch.request.parameters")).toBeUndefined();
  });
});

describe("parameterParsers registry", () => {
  afterEach(() => setParameterParsers(DEFAULT_PARSERS));

  it("starts at DEFAULT_PARSERS", () => {
    expect(parameterParsers()).toBe(DEFAULT_PARSERS);
  });

  it("setParameterParsers replaces the registry", () => {
    const xml: ParameterParser = (raw) => ({ xml: raw });
    setParameterParsers({ xml });
    expect(parameterParsers()).toEqual({ xml });
  });

  it("normalizes MimeType keys via .symbol (Rails transform_keys parity)", () => {
    const xml: ParameterParser = () => ({});
    const fakeMime = { symbol: "xml" };
    setParameterParsers(new Map<unknown, ParameterParser>([[fakeMime, xml]]));
    expect(parameterParsers()).toEqual({ xml });
  });

  it("paramsParsers host helper forwards to the registry", () => {
    const xml: ParameterParser = () => ({});
    setParameterParsers({ xml });
    const host = makeHost();
    expect(paramsParsers.call(host)).toEqual({ xml });
  });

  it("stream-backed rack.input is drained once and cached under RAW_POST_DATA", () => {
    let reads = 0;
    const input = {
      read() {
        reads += 1;
        return '{"a":1}';
      },
    };
    const req = new Request({
      REQUEST_METHOD: "POST",
      CONTENT_TYPE: "application/json",
      "rack.input": input,
    });
    expect(req.rawPost).toBe('{"a":1}');
    expect(req.rawPost).toBe('{"a":1}');
    expect(req.params).toMatchObject({ a: 1 });
    expect(reads).toBe(1);
  });

  it("Request.parameterParsers static accessor drives Request#requestParameters", () => {
    const xml: ParameterParser = (raw) => ({ parsed: raw });
    Request.parameterParsers = { ...DEFAULT_PARSERS, xml };
    expect(Request.parameterParsers).toMatchObject({ xml });
    const req = new Request({
      REQUEST_METHOD: "POST",
      CONTENT_TYPE: "application/xml",
      "rack.input": "<root/>",
    });
    expect(req.requestParameters).toEqual({ parsed: "<root/>" });
    expect(req.params).toMatchObject({ parsed: "<root/>" });
  });
});

describe("logParseErrorOnce", () => {
  it("logs once per host then no-ops", () => {
    const messages: string[] = [];
    const host = makeHost({
      rawPost: "garbage",
      logger: { debug: (m) => messages.push(m) },
    });
    logParseErrorOnce.call(host);
    logParseErrorOnce.call(host);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("Error occurred while parsing request parameters");
    expect(messages[0]).toContain("garbage");
  });
});

describe("parseFormattedParameters", () => {
  it("yields when content-length is zero", () => {
    const host = makeHost();
    const out = parseFormattedParameters.call(host, DEFAULT_PARSERS, () => ({ y: 1 }));
    expect(out).toEqual({ y: 1 });
  });

  it("parses when content-length is absent but a body is present (Rails content_length.zero? parity)", () => {
    const host = makeHost({
      contentLength: undefined,
      contentMimeType: MimeType.JSON,
      rawPost: '{"a":1}',
    });
    expect(parseFormattedParameters.call(host, DEFAULT_PARSERS, () => ({ y: 1 }))).toEqual({
      a: 1,
    });
  });

  it("yields when rawPost is empty even if content-length is absent", () => {
    const host = makeHost({
      contentLength: undefined,
      contentMimeType: MimeType.JSON,
      rawPost: "",
    });
    expect(parseFormattedParameters.call(host, DEFAULT_PARSERS, () => ({}))).toEqual({});
  });

  it("yields when no parser registered for the MIME type", () => {
    const host = makeHost({ contentLength: 1, contentMimeType: MimeType.HTML, rawPost: "x" });
    const out = parseFormattedParameters.call(host, DEFAULT_PARSERS, () => ({ y: 1 }));
    expect(out).toEqual({ y: 1 });
  });

  it("invokes the matching parser", () => {
    const host = makeHost({
      contentLength: 7,
      contentMimeType: MimeType.JSON,
      rawPost: '{"a":1}',
    });
    expect(parseFormattedParameters.call(host, DEFAULT_PARSERS, () => ({}))).toEqual({ a: 1 });
  });

  it("wraps parser failures in ParseError", () => {
    const host = makeHost({
      contentLength: 3,
      contentMimeType: MimeType.JSON,
      rawPost: "not json",
    });
    expect(() => parseFormattedParameters.call(host, DEFAULT_PARSERS, () => ({}))).toThrow(
      ParseError,
    );
  });
});
