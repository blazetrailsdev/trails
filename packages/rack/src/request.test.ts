import { describe, it, expect, vi } from "vitest";
import { Env, Helpers, Request } from "./request.js";
import {
  InvalidParameterError,
  ParameterTypeError,
  Params,
  ParamsTooDeepError,
  QueryParser,
} from "./query-parser.js";
import { EmptyContentError } from "./multipart/parser.js";
import { MockRequest } from "./mock-request.js";
import { Lint } from "./lint.js";
import { RACK_MULTIPART_TEMPFILE_FACTORY } from "./constants.js";
import {
  EOFError,
  File,
  StringIO,
  Tempfile,
  include,
  isEmpty,
  rbInspect,
  strNew,
  warn,
} from "@blazetrails/ruby-compat";
import {
  escape,
  paramDepthLimit,
  setMultipartFileLimit,
  setMultipartTotalPartLimit,
  setParamDepthLimit,
} from "./utils.js";
import { MultipartPartLimitError, MultipartTotalPartLimitError } from "./multipart.js";

vi.mock("@blazetrails/ruby-compat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@blazetrails/ruby-compat")>();
  return { ...actual, warn: vi.fn(actual.warn) };
});

function captureWarnings(yieldBlock: (warnings: unknown[][]) => void): void {
  const warnings: unknown[][] = [];
  vi.mocked(warn).mockImplementation((...args: unknown[]) => {
    warnings.push(args);
  });
  try {
    yieldBlock(warnings);
  } finally {
    vi.mocked(warn).mockReset();
  }
}

function assertEmpty(obj: object) {
  expect(Object.keys(obj)).toHaveLength(0);
}

function makeEnv(overrides: Record<string, any> = {}): Record<string, any> {
  return MockRequest.envFor("/", overrides);
}

const IPV6 = "2620:0:1c00:0:812c:9583:754b:ca11";
const PRIVATE_IPV6 = "fd5b:982e:9130:247f:0000:0000:0000:0000";

function rackRequestTests(makeRequest: (env: Record<string, any>) => any): void {
  function makeReq(uri = "/", overrides: Record<string, any> = {}): Request {
    return makeRequest(MockRequest.envFor(uri, overrides));
  }

  function ip(overrides: Record<string, any>): string | null {
    return makeReq("/", overrides).ip;
  }

  it("copies the env when duping", (ctx) => {
    const req = makeRequest(MockRequest.envFor("http://example.com:8080/"));

    ctx.skip(req.isDelegate(), "delegate requests don't dup environments");

    expect(req.dup().env).not.toBe(req.env);
  });

  it("can check if something has been set", () => {
    const req = makeRequest(MockRequest.envFor("http://example.com:8080/"));
    expect(req.hasHeader("FOO")).toBeFalsy();
  });

  it("can get a key from the env", () => {
    const req = makeRequest(MockRequest.envFor("http://example.com:8080/"));
    expect(req.getHeader("SERVER_NAME")).toBe("example.com");
  });

  it("can calculate the authority", () => {
    const req = makeReq("http://example.com:8080/");
    expect(req.authority).toBe("example.com:8080");
  });

  it("can calculate the authority without a port", () => {
    const req = makeReq("http://example.com/");
    expect(req.authority).toBe("example.com:80");
  });

  it("can calculate the authority without a port on ssl", () => {
    const req = makeReq("https://example.com/");
    expect(req.authority).toBe("example.com:443");
  });

  it("can calculate the server authority", () => {
    let req = makeRequest({ SERVER_NAME: "example.com" });
    expect(req.serverAuthority).toBe("example.com");
    req = makeRequest({ SERVER_NAME: "example.com", SERVER_PORT: 8080 });
    expect(req.serverAuthority).toBe("example.com:8080");
  });

  it("can calculate the port without an authority", () => {
    let req = makeRequest({ SERVER_PORT: 8080 });
    expect(req.port).toBe(8080);
    req = makeRequest({ HTTPS: "on" });
    expect(req.port).toBe(443);
  });

  it("yields to the block if no value has been set", () => {
    const req = makeRequest(MockRequest.envFor("http://example.com:8080/"));
    let yielded = false;
    req.fetchHeader("FOO", () => {
      yielded = true;
      return req.setHeader("FOO", "bar");
    });

    expect(yielded).toBeTruthy();
    expect(req.getHeader("FOO")).toBe("bar");
  });

  it("can iterate over values", () => {
    const req = makeReq();
    req.setHeader("foo", "bar");
    const hash: Record<string, any> = {};
    req.eachHeader((k, v) => {
      hash[k] = v;
    });
    expect(hash["foo"]).toBe("bar");
  });

  it("can set values in the env", () => {
    const req = makeRequest(MockRequest.envFor("http://example.com:8080/"));
    req.setHeader("FOO", "BAR");
    expect(req.getHeader("FOO")).toBe("BAR");
  });

  it("can add to multivalued headers in the env", () => {
    const req = makeRequest(MockRequest.envFor("http://example.com:8080/"));

    expect(req.addHeader("FOO", "1")).toBe("1");
    expect(req.getHeader("FOO")).toBe("1");

    expect(req.addHeader("FOO", "2")).toBe("1,2");
    expect(req.getHeader("FOO")).toBe("1,2");

    expect(req.addHeader("FOO", null)).toBe("1,2");
    expect(req.getHeader("FOO")).toBe("1,2");
  });

  it("can delete env values", () => {
    const req = makeRequest(MockRequest.envFor("http://example.com:8080/"));
    req.setHeader("foo", "bar");
    expect(req.hasHeader("foo")).toBeTruthy();
    req.deleteHeader("foo");
    expect(req.hasHeader("foo")).toBeFalsy();
  });

  it("wrap the rack variables", () => {
    const req = makeRequest(MockRequest.envFor("http://example.com:8080/"));

    expect(req.body).toBeNull();
    expect(req.scheme).toBe("http");
    expect(req.requestMethod).toBe("GET");

    expect(req.isGet()).toBeTruthy();
    expect(req.isPost()).toBeFalsy();
    expect(req.isPut()).toBeFalsy();
    expect(req.isDelete()).toBeFalsy();
    expect(req.isHead()).toBeFalsy();
    expect(req.isPatch()).toBeFalsy();

    expect(req.scriptName).toBe("");
    expect(req.pathInfo).toBe("/");
    expect(req.queryString).toBe("");

    expect(req.host).toBe("example.com");
    expect(req.port).toBe(8080);

    expect(req.contentLength).toBeNull();
    expect(req.contentType).toBeNull();
  });

  it("figure out the correct host", () => {
    let req;
    req = makeRequest(MockRequest.envFor("/", { HTTP_HOST: "www2.example.org" }));
    expect(req.host).toBe("www2.example.org");
    expect(req.hostname).toBe("www2.example.org");

    req = makeRequest(MockRequest.envFor("/", { HTTP_HOST: "123foo.example.com" }));
    expect(req.host).toBe("123foo.example.com");
    expect(req.hostname).toBe("123foo.example.com");

    req = makeRequest(MockRequest.envFor("/", { HTTP_HOST: "\u2661.com" }));
    expect(req.host).toBe("\u2661.com");
    expect(req.hostname).toBe("\u2661.com");

    req = makeRequest(MockRequest.envFor("/", { HTTP_HOST: "\u2661.com:80" }));
    expect(req.host).toBe("\u2661.com");
    expect(req.hostname).toBe("\u2661.com");

    req = makeRequest(MockRequest.envFor("/", { HTTP_HOST: "nic.\u8c37\u6b4c" }));
    expect(req.host).toBe("nic.\u8c37\u6b4c");
    expect(req.hostname).toBe("nic.\u8c37\u6b4c");

    req = makeRequest(MockRequest.envFor("/", { HTTP_HOST: "nic.\u8c37\u6b4c:80" }));
    expect(req.host).toBe("nic.\u8c37\u6b4c");
    expect(req.hostname).toBe("nic.\u8c37\u6b4c");

    req = makeRequest(MockRequest.envFor("/", { HTTP_HOST: "technically_invalid.example.com" }));
    expect(req.host).toBe("technically_invalid.example.com");
    expect(req.hostname).toBe("technically_invalid.example.com");

    req = makeRequest(MockRequest.envFor("/", { HTTP_HOST: "technically_invalid.example.com:80" }));
    expect(req.host).toBe("technically_invalid.example.com");
    expect(req.hostname).toBe("technically_invalid.example.com");

    req = makeRequest(MockRequest.envFor("/", { HTTP_HOST: "trailing_newline.com\n" }));
    expect(req.host).toBeNull();
    expect(req.hostname).toBeNull();

    req = makeRequest(MockRequest.envFor("/", { HTTP_HOST: "really\nbad\ninput" }));
    expect(req.host).toBeNull();
    expect(req.hostname).toBeNull();

    req = makeRequest(MockRequest.envFor("/", { HTTP_HOST: "some_service:3001" }));
    expect(req.host).toBe("some_service");
    expect(req.hostname).toBe("some_service");

    req = makeRequest(MockRequest.envFor("/", { SERVER_NAME: "example.org", SERVER_PORT: "9292" }));
    expect(req.host).toBe("example.org");
    expect(req.hostname).toBe("example.org");

    req = makeRequest(
      MockRequest.envFor("/", {
        HTTP_HOST: "localhost:81",
        HTTP_FORWARDED: "host=example.org:9292",
      }),
    );
    expect(req.host).toBe("example.org");

    req = makeRequest(
      MockRequest.envFor("/", { HTTP_HOST: "localhost:81", HTTP_FORWARDED: "host=ObFuScaTeD" }),
    );
    expect(req.host).toBe("ObFuScaTeD");

    req = makeRequest(
      MockRequest.envFor("/", {
        HTTP_HOST: "localhost:81",
        HTTP_FORWARDED: "host=example.com; host=example.org:9292",
      }),
    );
    expect(req.host).toBe("example.org");

    req = makeRequest(
      MockRequest.envFor("/", {
        HTTP_HOST: "localhost:81",
        HTTP_X_FORWARDED_HOST: "example.org:9292",
        HTTP_FORWARDED: "host=example.com",
      }),
    );
    expect(req.host).toBe("example.com");

    req = makeRequest(
      MockRequest.envFor("/", {
        HTTP_HOST: "localhost:81",
        HTTP_X_FORWARDED_HOST: "example.org:9292",
      }),
    );
    expect(req.host).toBe("example.org");
    expect(req.hostname).toBe("example.org");

    req = makeRequest(
      MockRequest.envFor("/", {
        HTTP_HOST: "localhost:81",
        HTTP_X_FORWARDED_HOST: "[2001:db8:cafe::17]:47011",
      }),
    );
    expect(req.host).toBe("[2001:db8:cafe::17]");
    expect(req.hostname).toBe("2001:db8:cafe::17");

    req = makeRequest(
      MockRequest.envFor("/", {
        HTTP_HOST: "localhost:81",
        HTTP_X_FORWARDED_HOST: "2001:db8:cafe::17",
      }),
    );
    expect(req.host).toBe("[2001:db8:cafe::17]");
    expect(req.hostname).toBe("2001:db8:cafe::17");

    req = makeRequest(
      MockRequest.envFor("/", { HTTP_HOST: "localhost:81", HTTP_X_FORWARDED_HOST: "[::]:47011" }),
    );
    expect(req.host).toBe("[::]");
    expect(req.hostname).toBe("::");

    req = makeRequest(
      MockRequest.envFor("/", {
        HTTP_HOST: "localhost:81",
        HTTP_X_FORWARDED_HOST: "[1111:2222:3333:4444:5555:6666:123.123.123.123]",
      }),
    );
    expect(req.host).toBe("[1111:2222:3333:4444:5555:6666:123.123.123.123]");
    expect(req.hostname).toBe("1111:2222:3333:4444:5555:6666:123.123.123.123");

    req = makeRequest(
      MockRequest.envFor("/", {
        HTTP_HOST: "localhost:81",
        HTTP_X_FORWARDED_HOST: "[1111:2222:3333:4444:5555:6666:123.123.123.123]:47011",
      }),
    );
    expect(req.host).toBe("[1111:2222:3333:4444:5555:6666:123.123.123.123]");
    expect(req.hostname).toBe("1111:2222:3333:4444:5555:6666:123.123.123.123");

    req = makeRequest(
      MockRequest.envFor("/", { HTTP_HOST: "localhost:81", HTTP_X_FORWARDED_HOST: "0.0.0.0" }),
    );
    expect(req.host).toBe("0.0.0.0");
    expect(req.hostname).toBe("0.0.0.0");

    req = makeRequest(
      MockRequest.envFor("/", {
        HTTP_HOST: "localhost:81",
        HTTP_X_FORWARDED_HOST: "0.0.0.0:47011",
      }),
    );
    expect(req.host).toBe("0.0.0.0");
    expect(req.hostname).toBe("0.0.0.0");

    req = makeRequest(
      MockRequest.envFor("/", {
        HTTP_HOST: "localhost:81",
        HTTP_X_FORWARDED_HOST: "255.255.255.255",
      }),
    );
    expect(req.host).toBe("255.255.255.255");
    expect(req.hostname).toBe("255.255.255.255");

    req = makeRequest(
      MockRequest.envFor("/", {
        HTTP_HOST: "localhost:81",
        HTTP_X_FORWARDED_HOST: "255.255.255.255:47011",
      }),
    );
    expect(req.host).toBe("255.255.255.255");
    expect(req.hostname).toBe("255.255.255.255");

    req = makeRequest(MockRequest.envFor("/", { HTTP_HOST: "really\nbad\ninput" }));
    expect(req.host).toBeNull();
    expect(req.hostname).toBeNull();

    req = makeRequest(
      MockRequest.envFor("/", { HTTP_HOST: "localhost:81", HTTP_X_FORWARDED_HOST: "[0]" }),
    );
    expect(req.host).toBeNull();
    expect(req.hostname).toBeNull();

    req = makeRequest(
      MockRequest.envFor("/", { HTTP_HOST: "localhost:81", HTTP_X_FORWARDED_HOST: "[:::]" }),
    );
    expect(req.host).toBeNull();
    expect(req.hostname).toBeNull();

    req = makeRequest(
      MockRequest.envFor("/", {
        HTTP_HOST: "localhost:81",
        HTTP_X_FORWARDED_HOST: "[1111:2222:3333:4444:5555:6666:7777:88888]",
      }),
    );
    expect(req.host).toBeNull();
    expect(req.hostname).toBeNull();

    req = makeRequest(
      MockRequest.envFor("/", { HTTP_HOST: "localhost:81", HTTP_X_FORWARDED_HOST: "0.0..0.0" }),
    );
    expect(req.host).toBe("0.0..0.0");
    expect(req.hostname).toBe("0.0..0.0");

    req = makeRequest(
      MockRequest.envFor("/", {
        HTTP_HOST: "localhost:81",
        HTTP_X_FORWARDED_HOST: "255.255.255.0255",
      }),
    );
    expect(req.host).toBe("255.255.255.0255");
    expect(req.hostname).toBe("255.255.255.0255");

    const env = MockRequest.envFor("/");
    delete env["SERVER_NAME"];
    req = makeRequest(env);
    expect(req.host).toBeNull();
  });

  it("figure out the correct port", () => {
    const port = (env: Record<string, any>): unknown => makeReq("/", env).port;
    const host = { HTTP_HOST: "localhost:81" };
    const fwd = (o: Record<string, any> = {}): Record<string, any> => ({
      ...host,
      HTTP_X_FORWARDED_HOST: "example.org",
      ...o,
    });

    expect(port({ HTTP_HOST: "www2.example.org" })).toBe(80);
    expect(port({ HTTP_HOST: "www2.example.org:81" })).toBe(81);
    expect(port({ HTTP_HOST: "some_service:3001" })).toBe(3001);
    expect(port({ SERVER_NAME: "example.org", SERVER_PORT: "9292" })).toBe(9292);
    expect(port(fwd({ HTTP_X_FORWARDED_HOST: "example.org:9292" }))).toBe(9292);
    expect(port(fwd({ HTTP_X_FORWARDED_HOST: "[2001:db8:cafe::17]:47011" }))).toBe(47011);
    expect(port(fwd({ HTTP_X_FORWARDED_HOST: "2001:db8:cafe::17" }))).toBe(80);
    expect(port(fwd())).toBe(80);
    expect(port(fwd({ HTTP_X_FORWARDED_SSL: "on" }))).toBe(443);
    expect(port(fwd({ HTTP_X_FORWARDED_PROTO: "https" }))).toBe(443);
    expect(port(fwd({ HTTP_X_FORWARDED_PORT: "9393" }))).toBe(9393);
    expect(port(fwd({ HTTP_X_FORWARDED_HOST: "example.org:9393", SERVER_PORT: "80" }))).toBe(9393);
    expect(port(fwd({ SERVER_PORT: "9393" }))).toBe(80);
    const local = { HTTP_HOST: "localhost", SERVER_PORT: "80" };
    expect(port({ ...local, HTTP_X_FORWARDED_PROTO: "https" })).toBe(443);
    expect(port({ ...local, HTTP_X_FORWARDED_PROTO: "https,https" })).toBe(443);
    expect(
      port({
        HTTP_HOST: "localhost",
        HTTP_FORWARDED: "proto=https",
        HTTP_X_FORWARDED_PROTO: "http",
        SERVER_PORT: "9393",
      }),
    ).toBe(443);
  });

  it("have forwarded_* methods respect forwarded_priority", () => {
    const defaultPriority = Request.forwardedPriority;
    const defaultProtoPriority = Request.xForwardedProtoPriority;

    function req(headers: Record<string, string>): Request {
      return makeRequest(MockRequest.envFor("/", headers));
    }

    try {
      expect(
        req({ HTTP_FORWARDED: "for=1.2.3.4", HTTP_X_FORWARDED_FOR: "2.3.4.5" }).forwardedFor,
      ).toEqual(["1.2.3.4"]);

      expect(
        req({ HTTP_FORWARDED: "for=1.2.3.4:1234", HTTP_X_FORWARDED_PORT: "2345" }).forwardedPort,
      ).toEqual([1234]);

      expect(
        req({ HTTP_FORWARDED: "for=1.2.3.4", HTTP_X_FORWARDED_PORT: "2345" }).forwardedPort,
      ).toEqual([]);

      expect(
        req({
          HTTP_FORWARDED: "host=1.2.3.4, host=3.4.5.6",
          HTTP_X_FORWARDED_HOST: "2.3.4.5,4.5.6.7",
        }).forwardedAuthority,
      ).toBe("3.4.5.6");

      expect(
        req({ HTTP_X_FORWARDED_PROTO: "ws", HTTP_X_FORWARDED_SCHEME: "http" }).forwardedScheme,
      ).toBe("ws");

      expect(req({ HTTP_X_FORWARDED_SCHEME: "http" }).forwardedScheme).toBe("http");

      Request.forwardedPriority = [null, "x_forwarded", "forwarded"];

      expect(
        req({ HTTP_FORWARDED: "for=1.2.3.4", HTTP_X_FORWARDED_FOR: "2.3.4.5" }).forwardedFor,
      ).toEqual(["2.3.4.5"]);

      expect(
        req({ HTTP_FORWARDED: "for=1.2.3.4", HTTP_X_FORWARDED_PORT: "2345" }).forwardedPort,
      ).toEqual([2345]);

      expect(
        req({
          HTTP_FORWARDED: "host=1.2.3.4, host=3.4.5.6",
          HTTP_X_FORWARDED_HOST: "2.3.4.5,4.5.6.7",
        }).forwardedAuthority,
      ).toBe("4.5.6.7");

      expect(
        req({
          HTTP_FORWARDED: "proto=https",
          HTTP_X_FORWARDED_PROTO: "ws",
          HTTP_X_FORWARDED_SCHEME: "http",
        }).forwardedScheme,
      ).toBe("ws");

      expect(
        req({ HTTP_FORWARDED: "proto=https", HTTP_X_FORWARDED_SCHEME: "http" }).forwardedScheme,
      ).toBe("http");

      expect(req({ HTTP_FORWARDED: "proto=https" }).forwardedScheme).toBe("https");

      Request.xForwardedProtoPriority = [null, "scheme", "proto"];

      expect(
        req({
          HTTP_FORWARDED: "proto=https",
          HTTP_X_FORWARDED_PROTO: "ws",
          HTTP_X_FORWARDED_SCHEME: "http",
        }).forwardedScheme,
      ).toBe("http");

      expect(
        req({ HTTP_FORWARDED: "proto=https", HTTP_X_FORWARDED_PROTO: "ws" }).forwardedScheme,
      ).toBe("ws");

      expect(req({ HTTP_FORWARDED: "proto=https" }).forwardedScheme).toBe("https");

      Request.forwardedPriority = ["x_forwarded"];

      expect(
        req({
          HTTP_FORWARDED: "proto=https",
          HTTP_X_FORWARDED_PROTO: "ws",
          HTTP_X_FORWARDED_SCHEME: "http",
        }).forwardedScheme,
      ).toBe("http");

      expect(
        req({ HTTP_FORWARDED: "proto=https", HTTP_X_FORWARDED_PROTO: "ws" }).forwardedScheme,
      ).toBe("ws");

      expect(req({ HTTP_FORWARDED: "proto=https" }).forwardedScheme).toBeNull();

      Request.xForwardedProtoPriority = ["scheme"];

      expect(
        req({
          HTTP_FORWARDED: "proto=https",
          HTTP_X_FORWARDED_PROTO: "ws",
          HTTP_X_FORWARDED_SCHEME: "http",
        }).forwardedScheme,
      ).toBe("http");

      expect(
        req({ HTTP_FORWARDED: "proto=https", HTTP_X_FORWARDED_PROTO: "ws" }).forwardedScheme,
      ).toBeNull();

      expect(req({ HTTP_FORWARDED: "proto=https" }).forwardedScheme).toBeNull();

      Request.xForwardedProtoPriority = ["proto"];

      expect(
        req({
          HTTP_FORWARDED: "proto=https",
          HTTP_X_FORWARDED_PROTO: "ws",
          HTTP_X_FORWARDED_SCHEME: "http",
        }).forwardedScheme,
      ).toBe("ws");

      expect(
        req({ HTTP_FORWARDED: "proto=https", HTTP_X_FORWARDED_SCHEME: "http" }).forwardedScheme,
      ).toBeNull();

      expect(req({ HTTP_FORWARDED: "proto=https" }).forwardedScheme).toBeNull();

      Request.xForwardedProtoPriority = [];

      expect(
        req({
          HTTP_FORWARDED: "proto=https",
          HTTP_X_FORWARDED_PROTO: "ws",
          HTTP_X_FORWARDED_SCHEME: "http",
        }).forwardedScheme,
      ).toBeNull();

      expect(
        req({ HTTP_FORWARDED: "proto=https", HTTP_X_FORWARDED_SCHEME: "http" }).forwardedScheme,
      ).toBeNull();

      expect(req({ HTTP_FORWARDED: "proto=https" }).forwardedScheme).toBeNull();

      Request.xForwardedProtoPriority = defaultProtoPriority;
      Request.forwardedPriority = ["forwarded"];

      expect(
        req({
          HTTP_FORWARDED: "proto=https",
          HTTP_X_FORWARDED_PROTO: "ws",
          HTTP_X_FORWARDED_SCHEME: "http",
        }).forwardedScheme,
      ).toBe("https");

      expect(
        req({ HTTP_X_FORWARDED_PROTO: "ws", HTTP_X_FORWARDED_SCHEME: "http" }).forwardedScheme,
      ).toBeNull();

      expect(req({ HTTP_X_FORWARDED_PROTO: "ws" }).forwardedScheme).toBeNull();

      Request.forwardedPriority = [];

      expect(
        req({ HTTP_FORWARDED: "for=1.2.3.4", HTTP_X_FORWARDED_FOR: "2.3.4.5" }).forwardedFor,
      ).toBeNull();

      expect(
        req({ HTTP_FORWARDED: "for=1.2.3.4", HTTP_X_FORWARDED_PORT: "2345" }).forwardedPort,
      ).toBeNull();

      expect(
        req({
          HTTP_FORWARDED: "host=1.2.3.4, host=3.4.5.6",
          HTTP_X_FORWARDED_HOST: "2.3.4.5,4.5.6.7",
        }).forwardedAuthority,
      ).toBeNull();

      expect(
        req({
          HTTP_FORWARDED: "proto=https",
          HTTP_X_FORWARDED_PROTO: "ws",
          HTTP_X_FORWARDED_SCHEME: "http",
        }).forwardedScheme,
      ).toBeNull();

      expect(
        req({ HTTP_FORWARDED: "proto=https", HTTP_X_FORWARDED_SCHEME: "http" }).forwardedScheme,
      ).toBeNull();

      expect(req({ HTTP_FORWARDED: "proto=https" }).forwardedScheme).toBeNull();
    } finally {
      Request.forwardedPriority = defaultPriority;
      Request.xForwardedProtoPriority = defaultProtoPriority;
    }
  });

  it("figure out the correct host with port", () => {
    const hwp = (env: Record<string, any>): unknown => makeReq("/", env).hostWithPort();
    const host = { HTTP_HOST: "localhost:81" };

    expect(hwp({ HTTP_HOST: "www2.example.org" })).toBe("www2.example.org");
    expect(hwp(host)).toBe("localhost:81");
    expect(hwp({ SERVER_NAME: "example.org", SERVER_PORT: "9292" })).toBe("example.org:9292");
    expect(hwp({ SERVER_NAME: "example.org" })).toBe("example.org");
    expect(hwp({ ...host, HTTP_X_FORWARDED_HOST: "example.org:9292" })).toBe("example.org:9292");
    const ipv6 = "[2001:db8:cafe::17]";
    expect(hwp({ ...host, HTTP_X_FORWARDED_HOST: `${ipv6}:47011` })).toBe(`${ipv6}:47011`);
    expect(hwp({ ...host, HTTP_X_FORWARDED_HOST: "2001:db8:cafe::17" })).toBe(ipv6);
    const org = { ...host, HTTP_X_FORWARDED_HOST: "example.org" };
    expect(hwp({ ...org, SERVER_PORT: "9393" })).toBe("example.org");
    expect(hwp({ ...org, HTTP_FORWARDED: "host=example.com:9292", SERVER_PORT: "9393" })).toBe(
      "example.com:9292",
    );
  });

  it("parse the query string", () => {
    const request = makeRequest(MockRequest.envFor("/?foo=bar&quux=bla&nothing&empty="));
    expect(request.queryString).toBe("foo=bar&quux=bla&nothing&empty=");
    expect(request.GET).toEqual({ foo: "bar", quux: "bla", nothing: null, empty: "" });
    expect(isEmpty(request.POST)).toBeTruthy();
    expect(request.params).toEqual({ foo: "bar", quux: "bla", nothing: null, empty: "" });
  });

  it("handles invalid unicode in query string value", () => {
    const request = makeRequest(MockRequest.envFor("/?foo=%81E"));
    expect(request.queryString).toBe("foo=%81E");
    expect(request.GET).toEqual({ foo: strNew([0x81, 0x45]) });
    expect(isEmpty(request.POST)).toBeTruthy();
    expect(request.params).toEqual({ foo: strNew([0x81, 0x45]) });
  });

  it("handles invalid unicode in query string key", () => {
    const request = makeRequest(MockRequest.envFor("/?foo%81E=1"));
    expect(request.queryString).toBe("foo%81E=1");
    expect(request.GET).toEqual({ [strNew([0x66, 0x6f, 0x6f, 0x81, 0x45])]: "1" });
    expect(isEmpty(request.POST)).toBeTruthy();
    expect(request.params).toEqual({ [strNew([0x66, 0x6f, 0x6f, 0x81, 0x45])]: "1" });
  });

  it("not truncate query strings containing semi-colons #543 only in POST", () => {
    const mr = MockRequest.envFor("/", { REQUEST_METHOD: "POST", ":input": "foo=bar&quux=b;la" });
    const req = makeRequest(mr);
    expect(req.queryString).toBe("");
    expect(isEmpty(req.GET)).toBeTruthy();
    expect(req.POST).toEqual({ foo: "bar", quux: "b;la" });
    expect(req.params).toEqual({ ...req.GET, ...req.POST });
  });

  it("should use the query_parser for query parsing", () => {
    const parser = new QueryParser(Params, 100);
    const c = class extends Request {
      override queryParser = (): QueryParser => parser;
    };
    const req = new c(MockRequest.envFor("/?foo=bar&quux=bla"));
    expect(req.GET["foo"]).toBe("bar");
    expect(req.GET["quux"]).toBe("bla");
    expect(req.params["foo"]).toBe("bar");
    expect(req.params["quux"]).toBe("bla");
  });

  it("does not use semi-colons as separators for query strings in GET", () => {
    const req = makeRequest(MockRequest.envFor("/?foo=bar&quux=b;la;wun=duh"));
    expect(req.queryString).toBe("foo=bar&quux=b;la;wun=duh");
    expect(req.GET).toEqual({ foo: "bar", quux: "b;la;wun=duh" });
    expect(isEmpty(req.POST)).toBeTruthy();
    expect(req.params).toEqual({ foo: "bar", quux: "b;la;wun=duh" });
  });

  it("limit the allowed parameter depth when parsing parameters", () => {
    let env = MockRequest.envFor(`/?a${"[a]".repeat(40)}=b`);
    let req = makeRequest(env);
    expect(() => req.GET).toThrow(ParamsTooDeepError);

    env = MockRequest.envFor(`/?a${"[a]".repeat(30)}=b`);
    req = makeRequest(env);
    let params = req.GET;
    for (let i = 0; i < 30; i++) params = params["a"];
    expect(params["a"]).toBe("b");

    const old = paramDepthLimit();
    setParamDepthLimit(3);
    try {
      env = MockRequest.envFor("/?a[a][a]=b");
      req = makeRequest(env);
      expect(req.GET["a"]["a"]["a"]).toBe("b");

      env = MockRequest.envFor("/?a[a][a][a]=b");
      req = makeRequest(env);
      expect(() => makeRequest(env).GET).toThrow(ParamsTooDeepError);
    } finally {
      setParamDepthLimit(old);
    }
  });

  it("not unify GET and POST when calling params", () => {
    const req = makeReq("/?foo=get", {
      ":method": "POST",
      ":input": "foo=post",
      CONTENT_TYPE: "application/x-www-form-urlencoded",
    });
    expect(req.GET["foo"]).toBe("get");
    expect(req.POST["foo"]).toBe("post");
    expect(req.params["foo"]).toBe("post");
  });

  it("use the query_parser's params_class for multipart params", () => {
    const parser = new QueryParser(Params, 100);
    const c = class extends Request {
      override queryParser = (): QueryParser => parser;
    };
    const mr = MockRequest.envFor("/?foo=quux", {
      REQUEST_METHOD: "POST",
      ":input": "foo=bar&quux=bla",
    });
    const req = new c(mr);

    void req.params;

    expect(req.GET["foo"]).toBe("quux");
    expect(req.POST["foo"]).toBe("bar");
    expect(req.POST["quux"]).toBe("bla");
    expect(req.params["foo"]).toBe("bar");
    expect(req.params["quux"]).toBe("bla");
  });

  it("raise if input params has invalid %-encoding", () => {
    const mr = MockRequest.envFor("/?foo=quux", {
      REQUEST_METHOD: "POST",
      ":input": "a%=1",
    });
    const req = makeRequest(mr);

    let error: Error | undefined;
    expect(() => {
      try {
        return req.POST;
      } catch (e) {
        error = e as Error;
        throw e;
      }
    }).toThrow(InvalidParameterError);
    expect(error!.message).toBe("invalid %-encoding (a%)");
  });

  it("return empty POST data if rack.input is missing", () => {
    const req = makeRequest({});
    assertEmpty(req.POST);
  });

  it("parse POST data when method is POST and no content-type given", () => {
    const req = makeReq("/?foo=quux", { ":method": "POST", ":input": "foo=bar&quux=bla" });
    expect(req.contentType).toBeNull();
    expect(req.mediaType).toBeNull();
    expect(req.queryString).toBe("foo=quux");
    expect(req.GET).toEqual({ foo: "quux" });
    expect(req.POST).toEqual({ foo: "bar", quux: "bla" });
    expect(req.params).toEqual({ foo: "bar", quux: "bla" });
  });

  it("parse POST data with explicit content type regardless of method", () => {
    const req = makeRequest(
      MockRequest.envFor("/", {
        CONTENT_TYPE: "application/x-www-form-urlencoded;foo=bar",
        ":input": "foo=bar&quux=bla",
      }),
    );
    expect(req.contentType).toBe("application/x-www-form-urlencoded;foo=bar");
    expect(req.mediaType).toBe("application/x-www-form-urlencoded");
    expect(req.mediaTypeParams["foo"]).toBe("bar");
    expect(req.POST).toEqual({ foo: "bar", quux: "bla" });
    expect(req.params).toEqual({ foo: "bar", quux: "bla" });
  });

  it("not parse POST data when media type is not form-data", () => {
    const req = makeRequest(
      MockRequest.envFor("/?foo=quux", {
        REQUEST_METHOD: "POST",
        CONTENT_TYPE: "text/plain;charset=utf-8",
        ":input": "foo=bar&quux=bla",
      }),
    );
    expect(req.contentType).toBe("text/plain;charset=utf-8");
    expect(req.mediaType).toBe("text/plain");
    expect(req.mediaTypeParams["charset"]).toBe("utf-8");
    expect(req.contentCharset).toBe("utf-8");
    const post = req.POST;
    assertEmpty(post);
    expect(req.POST).toBe(post);
    expect(req.params).toEqual({ foo: "quux" });
    expect(req.body.read()).toBe("foo=bar&quux=bla");
  });

  it("parse POST data on PUT when media type is form-data", () => {
    const req = makeReq("/", {
      ":method": "PUT",
      ":input": "foo=bar",
      CONTENT_TYPE: "application/x-www-form-urlencoded",
    });
    expect(req.POST["foo"]).toBe("bar");
  });

  it("safely accepts POST requests with empty body", () => {
    const mr = MockRequest.envFor("/", {
      REQUEST_METHOD: "POST",
      CONTENT_TYPE: "multipart/form-data, boundary=AaB03x",
      CONTENT_LENGTH: "0",
      ":input": null,
    });

    const req = makeRequest(mr);
    expect(req.queryString).toBe("");
    expect(isEmpty(req.GET)).toBeTruthy();
    expect(isEmpty(req.POST)).toBeTruthy();
    expect(req.params).toEqual({});
  });

  it("clean up Safari's ajax POST body", () => {
    const req = makeReq("/", {
      ":method": "POST",
      ":input": "\0",
      CONTENT_TYPE: "application/x-www-form-urlencoded",
    });
    expect(req.POST).toEqual({});
  });

  it("extract referrer correctly", () => {
    let req = makeRequest(MockRequest.envFor("/", { HTTP_REFERER: "/some/path" }));
    expect(req.referer).toBe("/some/path");

    req = makeRequest(MockRequest.envFor("/"));
    expect(req.referer).toBeNull();
  });

  it("extract user agent correctly", () => {
    let req = makeRequest(MockRequest.envFor("/", { HTTP_USER_AGENT: "Mozilla/4.0 (compatible)" }));
    expect(req.userAgent).toBe("Mozilla/4.0 (compatible)");

    req = makeRequest(MockRequest.envFor("/"));
    expect(req.userAgent).toBeNull();
  });

  it("treat missing content type as nil", () => {
    const env = makeEnv();
    delete env["CONTENT_TYPE"];
    expect(makeRequest(env).contentType).toBeNull();
  });

  it("treat empty content type as nil", () => {
    const req = makeReq("/", { CONTENT_TYPE: "" });
    expect(req.contentType).toBeNull();
  });

  it("return nil media type for empty content type", () => {
    const req = makeReq("/", { CONTENT_TYPE: "" });
    expect(req.mediaType).toBeNull();
  });

  it("figure out if called via XHR", () => {
    let req = makeRequest(MockRequest.envFor(""));
    expect(req.xhr).toBeFalsy();

    req = makeRequest(MockRequest.envFor("", { HTTP_X_REQUESTED_WITH: "XMLHttpRequest" }));
    expect(req.xhr).toBeTruthy();
  });

  it("ssl detection", () => {
    let request = makeReq("/");
    expect(request.scheme).toBe("http");
    expect(request.ssl).toBeFalsy();

    request = makeReq("/", { HTTP_X_FORWARDED_SCHEME: "ws" });
    expect(request.scheme).toBe("ws");
    expect(request.ssl).toBeFalsy();

    request = makeReq("/", { HTTP_X_FORWARDED_PROTO: "ws" });
    expect(request.scheme).toBe("ws");

    request = makeReq("/", { HTTP_FORWARDED: "proto=https" });
    expect(request.scheme).toBe("https");
    expect(request.ssl).toBeTruthy();

    request = makeReq("/", { HTTP_FORWARDED: "proto=https, proto=http" });
    expect(request.scheme).toBe("http");
    expect(request.ssl).toBeFalsy();

    request = makeReq("/", { HTTP_FORWARDED: "proto=http, proto=https" });
    expect(request.scheme).toBe("https");
    expect(request.ssl).toBeTruthy();

    request = makeReq("/", { HTTPS: "on" });
    expect(request.scheme).toBe("https");
    expect(request.ssl).toBeTruthy();

    request = makeReq("/", { "rack.url_scheme": "https" });
    expect(request.scheme).toBe("https");
    expect(request.ssl).toBeTruthy();

    request = makeReq("/", { "rack.url_scheme": "wss" });
    expect(request.scheme).toBe("wss");
    expect(request.ssl).toBeTruthy();

    request = makeReq("/", { HTTP_HOST: "www.example.org:8080" });
    expect(request.scheme).toBe("http");
    expect(request.ssl).toBeFalsy();

    request = makeReq("/", { HTTP_HOST: "www.example.org:8443", HTTPS: "on" });
    expect(request.scheme).toBe("https");
    expect(request.ssl).toBeTruthy();

    request = makeReq("/", { HTTP_HOST: "www.example.org:8443", HTTP_X_FORWARDED_SSL: "on" });
    expect(request.scheme).toBe("https");
    expect(request.ssl).toBeTruthy();

    request = makeReq("/", { HTTP_X_FORWARDED_SCHEME: "https" });
    expect(request.scheme).toBe("https");
    expect(request.ssl).toBeTruthy();

    request = makeReq("/", { HTTP_X_FORWARDED_SCHEME: "wss" });
    expect(request.scheme).toBe("wss");
    expect(request.ssl).toBeTruthy();

    request = makeReq("/", { HTTP_X_FORWARDED_PROTO: "https" });
    expect(request.scheme).toBe("https");
    expect(request.ssl).toBeTruthy();

    request = makeReq("/", { HTTP_X_FORWARDED_PROTO: "https, http, http" });
    expect(request.scheme).toBe("http");
    expect(request.ssl).toBeFalsy();

    request = makeReq("/", { HTTP_X_FORWARDED_PROTO: "wss" });
    expect(request.scheme).toBe("wss");
    expect(request.ssl).toBeTruthy();
  });

  it("prevents scheme abuse", () => {
    const request = makeReq("/", {
      HTTP_X_FORWARDED_SCHEME: 'a."><script>alert(1)</script>',
    });
    expect(request.scheme).toBe("http");
  });

  it("parse cookies", () => {
    const req = makeRequest(MockRequest.envFor("", { HTTP_COOKIE: "foo=bar;quux=h&m" }));
    expect(req.cookies).toEqual({ foo: "bar", quux: "h&m" });
    req.deleteHeader("HTTP_COOKIE");
    expect(req.cookies).toEqual({});
  });

  it("always return the same hash object", () => {
    const req = makeRequest(MockRequest.envFor("", { HTTP_COOKIE: "foo=bar;quux=h&m" }));
    const hash = req.cookies;
    delete req.env["HTTP_COOKIE"];
    expect(req.cookies).toEqual(hash);
    req.env["HTTP_COOKIE"] = "zoo=m";
    expect(req.cookies).toEqual(hash);
  });

  it("modify the cookies hash in place", () => {
    const req = makeRequest(MockRequest.envFor(""));
    expect(req.cookies).toEqual({});
    req.cookies["foo"] = "bar";
    expect(req.cookies).toEqual({ foo: "bar" });
  });

  it("not modify the params hash in place", (ctx) => {
    const e = MockRequest.envFor("");
    const req1 = makeRequest(e);
    ctx.skip(
      req1.isDelegate(),
      "delegate requests don't cache params, so mutations have no impact",
    );
    expect(req1.params).toEqual({});
    req1.params["foo"] = "bar";
    expect(req1.params).toEqual({ foo: "bar" });
    const req2 = makeRequest(e);
    expect(req2.params).toEqual({});
  });

  it("modify params hash if param is in GET", () => {
    const e = MockRequest.envFor("?foo=duh");
    const req1 = makeRequest(e);
    expect(req1.params).toEqual({ foo: "duh" });
    req1.updateParam("foo", "bar");
    expect(req1.params).toEqual({ foo: "bar" });
    const req2 = makeRequest(e);
    expect(req2.params).toEqual({ foo: "bar" });
  });

  it("modify params hash if param is in POST", () => {
    const e = MockRequest.envFor("", { REQUEST_METHOD: "POST", ":input": "foo=duh" });
    const req1 = makeRequest(e);
    expect(req1.params).toEqual({ foo: "duh" });
    req1.updateParam("foo", "bar");
    expect(req1.params).toEqual({ foo: "bar" });
    const req2 = makeRequest(e);
    expect(req2.params).toEqual({ foo: "bar" });
  });

  it("modify params hash, even if param didn't exist before", () => {
    const e = MockRequest.envFor("");
    const req1 = makeRequest(e);
    expect(req1.params).toEqual({});
    req1.updateParam("foo", "bar");
    expect(req1.params).toEqual({ foo: "bar" });
    const req2 = makeRequest(e);
    expect(req2.params).toEqual({ foo: "bar" });
  });

  it("modify params hash by changing only GET", () => {
    const e = MockRequest.envFor("?foo=duhget");
    const req = makeRequest(e);
    expect(req.GET).toEqual({ foo: "duhget" });
    expect(req.POST).toEqual({});
    req.updateParam("foo", "bar");
    expect(req.GET).toEqual({ foo: "bar" });
    expect(req.POST).toEqual({});
  });

  it("modify params hash by changing only POST", () => {
    const e = MockRequest.envFor("", { REQUEST_METHOD: "POST", ":input": "foo=duhpost" });
    const req = makeRequest(e);
    expect(req.GET).toEqual({});
    expect(req.POST).toEqual({ foo: "duhpost" });
    req.updateParam("foo", "bar");
    expect(req.GET).toEqual({});
    expect(req.POST).toEqual({ foo: "bar" });
  });

  it("modify params hash, even if param is defined in both POST and GET", () => {
    const e = MockRequest.envFor("?foo=duhget", {
      REQUEST_METHOD: "POST",
      ":input": "foo=duhpost",
    });
    const req1 = makeRequest(e);
    expect(req1.GET).toEqual({ foo: "duhget" });
    expect(req1.POST).toEqual({ foo: "duhpost" });
    expect(req1.params).toEqual({ foo: "duhpost" });
    req1.updateParam("foo", "bar");
    expect(req1.GET).toEqual({ foo: "bar" });
    expect(req1.POST).toEqual({ foo: "bar" });
    expect(req1.params).toEqual({ foo: "bar" });
    const req2 = makeRequest(e);
    expect(req2.GET).toEqual({ foo: "bar" });
    expect(req2.POST).toEqual({ foo: "bar" });
    expect(req2.params).toEqual({ foo: "bar" });
    expect(req2.params).toEqual({ foo: "bar" });
  });

  it("allow deleting from params hash if param is in GET", () => {
    const e = MockRequest.envFor("?foo=bar");
    const req1 = makeRequest(e);
    expect(req1.params).toEqual({ foo: "bar" });
    expect(req1.deleteParam("foo")).toBe("bar");
    expect(req1.params).toEqual({});
    const req2 = makeRequest(e);
    expect(req2.params).toEqual({});
  });

  it("allow deleting from params hash if param is in POST", () => {
    const e = MockRequest.envFor("", { REQUEST_METHOD: "POST", ":input": "foo=bar" });
    const req1 = makeRequest(e);
    expect(req1.params).toEqual({ foo: "bar" });
    expect(req1.deleteParam("foo")).toBe("bar");
    expect(req1.params).toEqual({});
    const req2 = makeRequest(e);
    expect(req2.params).toEqual({});
  });

  it("pass through non-uri escaped cookies as-is", () => {
    const req = makeReq("", { HTTP_COOKIE: "foo=%" });
    expect(req.cookies["foo"]).toBe("%");
  });

  it("parse cookies according to RFC 2109", () => {
    const req = makeReq("/", { HTTP_COOKIE: "foo=bar; foo=baz" });
    expect(req.cookies["foo"]).toBe("bar");
  });

  it("parse cookies with quotes", () => {
    const req = makeReq("/", { HTTP_COOKIE: 'foo="bar"' });
    expect(req.cookies["foo"]).toBe('"bar"');
  });

  it("provide setters", () => {
    const e = MockRequest.envFor("");
    const req = makeRequest(e);
    expect(req.scriptName).toBe("");
    req.scriptName = "/foo";
    expect(req.scriptName).toBe("/foo");
    expect(e["SCRIPT_NAME"]).toBe("/foo");

    expect(req.pathInfo).toBe("/");
    req.pathInfo = "/foo";
    expect(req.pathInfo).toBe("/foo");
    expect(e["PATH_INFO"]).toBe("/foo");
  });

  it("provide the original env", () => {
    const e = MockRequest.envFor("");
    const req = makeRequest(e);
    expect(req.env).toEqual(e);
  });

  it("restore the base URL", () => {
    expect(makeRequest(MockRequest.envFor("")).baseUrl).toBe("http://example.org");
    expect(makeRequest(MockRequest.envFor("", { SCRIPT_NAME: "/foo" })).baseUrl).toBe(
      "http://example.org",
    );
  });

  it("restore the URL", () => {
    expect(makeRequest(MockRequest.envFor("")).url).toBe("http://example.org/");
    expect(makeRequest(MockRequest.envFor("", { SCRIPT_NAME: "/foo" })).url).toBe(
      "http://example.org/foo/",
    );
    expect(makeRequest(MockRequest.envFor("/foo")).url).toBe("http://example.org/foo");
    expect(makeRequest(MockRequest.envFor("?foo")).url).toBe("http://example.org/?foo");
    expect(makeRequest(MockRequest.envFor("http://example.org:8080/")).url).toBe(
      "http://example.org:8080/",
    );
    expect(makeRequest(MockRequest.envFor("https://example.org/")).url).toBe(
      "https://example.org/",
    );
    expect(makeRequest(MockRequest.envFor("coffee://example.org/")).url).toBe(
      "coffee://example.org/",
    );
    expect(makeRequest(MockRequest.envFor("coffee://example.org:443/")).url).toBe(
      "coffee://example.org:443/",
    );
    expect(makeRequest(MockRequest.envFor("https://example.com:8080/foo?foo")).url).toBe(
      "https://example.com:8080/foo?foo",
    );
  });

  it("restore the full path", () => {
    expect(makeRequest(MockRequest.envFor("")).fullpath).toBe("/");
    expect(makeRequest(MockRequest.envFor("", { SCRIPT_NAME: "/foo" })).fullpath).toBe("/foo/");
    expect(makeRequest(MockRequest.envFor("/foo")).fullpath).toBe("/foo");
    expect(makeRequest(MockRequest.envFor("?foo")).fullpath).toBe("/?foo");
    expect(makeRequest(MockRequest.envFor("http://example.org:8080/")).fullpath).toBe("/");
    expect(makeRequest(MockRequest.envFor("https://example.org/")).fullpath).toBe("/");

    expect(makeRequest(MockRequest.envFor("https://example.com:8080/foo?foo")).fullpath).toBe(
      "/foo?foo",
    );
  });

  it("handle multiple media type parameters", () => {
    const req = makeRequest(
      MockRequest.envFor("/", {
        CONTENT_TYPE:
          'text/plain; foo=BAR,baz=bizzle dizzle;BLING=bam;blong="boo";zump="zoo\\"o";weird=lol"',
      }),
    );
    expect(req.formData).toBeFalsy();
    expect(Object.keys(req.mediaTypeParams)).toContain("foo");
    expect(req.mediaTypeParams["foo"]).toBe("BAR");
    expect(Object.keys(req.mediaTypeParams)).toContain("baz");
    expect(req.mediaTypeParams["baz"]).toBe("bizzle dizzle");
    expect(Object.keys(req.mediaTypeParams)).not.toContain("BLING");
    expect(Object.keys(req.mediaTypeParams)).toContain("bling");
    expect(req.mediaTypeParams["bling"]).toBe("bam");
    expect(req.mediaTypeParams["blong"]).toBe("boo");
    expect(req.mediaTypeParams["zump"]).toBe('zoo\\"o');
    expect(req.mediaTypeParams["weird"]).toBe('lol"');
  });

  it("returns the same error for invalid post inputs", () => {
    const env = {
      REQUEST_METHOD: "POST",
      PATH_INFO: "/foo",
      "rack.input": new StringIO("invalid=bar&invalid[foo]=bar"),
      HTTP_CONTENT_TYPE: "application/x-www-form-urlencoded",
    };

    for (let i = 0; i < 2; i++) {
      expect(() => new Request(env).POST).toThrow(ParameterTypeError);
    }
  });

  it("parse with junk before boundary", () => {
    const input = `blah blah\r
\r
--AaB03x\r
content-disposition: form-data; name="reply"\r
\r
yes\r
--AaB03x\r
content-disposition: form-data; name="fileupload"; filename="dj.jpg"\r
content-type: image/jpeg\r
content-transfer-encoding: base64\r
\r
/9j/4AAQSkZJRgABAQAAAQABAAD//gA+Q1JFQVRPUjogZ2QtanBlZyB2MS4wICh1c2luZyBJSkcg\r
--AaB03x--\r
`;
    const req = makeRequest(
      MockRequest.envFor("/", {
        CONTENT_TYPE: "multipart/form-data, boundary=AaB03x",
        CONTENT_LENGTH: input.length,
        ":input": input,
      }),
    );

    expect(Object.keys(req.POST)).toContain("fileupload");
    expect(Object.keys(req.POST)).toContain("reply");

    expect(req.formData).toBeTruthy();
    expect(req.contentLength).toBe(input.length);
    expect(req.mediaType).toBe("multipart/form-data");
    expect(Object.keys(req.mediaTypeParams)).toContain("boundary");
    expect(req.mediaTypeParams["boundary"]).toBe("AaB03x");

    expect(req.POST["reply"]).toBe("yes");

    const f = req.POST["fileupload"];
    expect(f).toBeInstanceOf(Object);
    expect(f.type).toBe("image/jpeg");
    expect(f.filename).toBe("dj.jpg");
    expect(Object.keys(f)).toContain("tempfile");
    expect(f.tempfile.size()).toBe(76);
  });

  it("not infinite loop with a malformed HTTP request", () => {
    const input = `--AaB03x
content-disposition: form-data; name="reply"

yes
--AaB03x
content-disposition: form-data; name="fileupload"; filename="dj.jpg"
content-type: image/jpeg
content-transfer-encoding: base64

/9j/4AAQSkZJRgABAQAAAQABAAD//gA+Q1JFQVRPUjogZ2QtanBlZyB2MS4wICh1c2luZyBJSkcg
--AaB03x--
`;
    const req = makeRequest(
      MockRequest.envFor("/", {
        CONTENT_TYPE: "multipart/form-data, boundary=AaB03x",
        CONTENT_LENGTH: input.length,
        ":input": input,
      }),
    );

    expect(() => req.POST).toThrow(EOFError);
  });

  it("parse multipart form data", () => {
    const input = `--AaB03x\r
content-disposition: form-data; name="reply"\r
\r
yes\r
--AaB03x\r
content-disposition: form-data; name="fileupload"; filename="dj.jpg"\r
content-type: image/jpeg\r
content-transfer-encoding: base64\r
\r
/9j/4AAQSkZJRgABAQAAAQABAAD//gA+Q1JFQVRPUjogZ2QtanBlZyB2MS4wICh1c2luZyBJSkcg\r
--AaB03x--\r
`;
    const req = makeRequest(
      MockRequest.envFor("/", {
        CONTENT_TYPE: "multipart/form-data, boundary=AaB03x",
        CONTENT_LENGTH: input.length,
        ":input": input,
      }),
    );

    expect(Object.keys(req.POST)).toContain("fileupload");
    expect(Object.keys(req.POST)).toContain("reply");

    expect(req.formData).toBeTruthy();
    expect(req.contentLength).toBe(input.length);
    expect(req.mediaType).toBe("multipart/form-data");
    expect(Object.keys(req.mediaTypeParams)).toContain("boundary");
    expect(req.mediaTypeParams["boundary"]).toBe("AaB03x");

    expect(req.POST["reply"]).toBe("yes");

    const f = req.POST["fileupload"];
    expect(f).toBeInstanceOf(Object);
    expect(f.type).toBe("image/jpeg");
    expect(f.filename).toBe("dj.jpg");
    expect(Object.keys(f)).toContain("tempfile");
    expect(f.tempfile.size()).toBe(76);

    expect(req.env["rack.request.form_pairs"]).toEqual([
      ["reply", "yes"],
      ["fileupload", f],
    ]);
  });

  it("parse multipart delimiter-only boundary", () => {
    const input = `--AaB03x--\r
`;
    const mr = MockRequest.envFor("/", {
      CONTENT_TYPE: "multipart/form-data, boundary=AaB03x",
      CONTENT_LENGTH: input.length,
      ":input": input,
    });

    const req = makeRequest(mr);
    expect(req.queryString).toBe("");
    expect(isEmpty(req.GET)).toBeTruthy();
    expect(isEmpty(req.POST)).toBeTruthy();
    expect(req.params).toEqual({});
  });

  it("MultipartPartLimitError when request has too many multipart file parts if limit set", () => {
    const boundary = "AaB03x";
    const parts = [];
    for (let i = 0; i < 10; i++) {
      parts.push(
        `--${boundary}\r\ncontent-disposition: form-data; name="f${i}"; filename="f${i}.txt"\r\ncontent-type: text/plain\r\n\r\ndata\r\n`,
      );
    }
    parts.push(`--${boundary}--\r\n`);
    const body = parts.join("");
    const env = {
      ...makeEnv(),
      CONTENT_TYPE: `multipart/form-data; boundary=${boundary}`,
      "rack.input": new StringIO(body),
    };
    setMultipartFileLimit(5);
    try {
      const req = makeRequest(env);
      expect(() => req.POST).toThrow(MultipartPartLimitError);
    } finally {
      setMultipartFileLimit(128);
    }
  });

  it("MultipartPartLimitError when request has too many multipart total parts if limit set", () => {
    const boundary = "AaB03x";
    const parts = [];
    for (let i = 0; i < 10; i++) {
      parts.push(`--${boundary}\r\ncontent-disposition: form-data; name="f${i}"\r\n\r\nval\r\n`);
    }
    parts.push(`--${boundary}--\r\n`);
    const body = parts.join("");
    const env = {
      ...makeEnv(),
      CONTENT_TYPE: `multipart/form-data; boundary=${boundary}`,
      "rack.input": new StringIO(body),
    };
    setMultipartTotalPartLimit(5);
    try {
      const req = makeRequest(env);
      expect(() => req.POST).toThrow(MultipartTotalPartLimitError);
    } finally {
      setMultipartTotalPartLimit(4096);
    }
  });

  it("closes tempfiles it created in the case of too many created", () => {
    const hex = (): string =>
      Array.from({ length: 10 }, () =>
        Math.floor(Math.random() * 256)
          .toString(16)
          .padStart(2, "0"),
      ).join("");
    let data = Array.from(
      { length: 10000 },
      () =>
        `--AaB03x\r\ncontent-type: text/plain\r\ncontent-disposition: attachment; name=${hex()}; filename=${hex()}\r\n\r\ncontents\r\n`,
    ).join("\r\n");
    data += "--AaB03x--\r";

    const files: Tempfile[] = [];
    const options = {
      CONTENT_TYPE: "multipart/form-data; boundary=AaB03x",
      CONTENT_LENGTH: String(data.length),
      [RACK_MULTIPART_TEMPFILE_FACTORY]: (filename: string, _contentType: string) => {
        const file = Tempfile.new(["RackMultipart", File.extname(filename)]);
        files.push(file);
        return file;
      },
      ":input": new StringIO(data),
    };

    const request = makeRequest(MockRequest.envFor("/", options));
    expect(() => request.POST).toThrow(MultipartPartLimitError);
    expect(files.length === 0).toBeFalsy();
    files.forEach((f) => expect(f.isClosed()).toBeTruthy());
  });

  it("parse big multipart form data", () => {
    const input = `--AaB03x\r
content-disposition: form-data; name="huge"; filename="huge"\r
\r
${"x".repeat(32768)}\r
--AaB03x\r
content-disposition: form-data; name="mean"; filename="mean"\r
\r
--AaB03xha\r
--AaB03x--\r
`;
    const req = makeRequest(
      MockRequest.envFor("/", {
        CONTENT_TYPE: "multipart/form-data, boundary=AaB03x",
        CONTENT_LENGTH: input.length,
        ":input": input,
      }),
    );

    expect(req.POST["huge"].tempfile.size()).toBe(32768);
    expect(req.POST["mean"].tempfile.size()).toBe(10);
    expect(req.POST["mean"].tempfile.read()).toBe("--AaB03xha");
  });

  it("record tempfiles from multipart form data in env[rack.tempfiles]", () => {
    const input = `--AaB03x\r
content-disposition: form-data; name="fileupload"; filename="foo.jpg"\r
content-type: image/jpeg\r
content-transfer-encoding: base64\r
\r
/9j/4AAQSkZJRgABAQAAAQABAAD//gA+Q1JFQVRPUjogZ2QtanBlZyB2MS4wICh1c2luZyBJSkcg\r
--AaB03x\r
content-disposition: form-data; name="fileupload"; filename="bar.jpg"\r
content-type: image/jpeg\r
content-transfer-encoding: base64\r
\r
/9j/4AAQSkZJRgABAQAAAQABAAD//gA+Q1JFQVRPUjogZ2QtanBlZyB2MS4wICh1c2luZyBJSkcg\r
--AaB03x--\r
`;
    const env = MockRequest.envFor("/", {
      CONTENT_TYPE: "multipart/form-data, boundary=AaB03x",
      CONTENT_LENGTH: input.length,
      ":input": input,
    });
    const req = makeRequest(env);
    void req.params;
    expect(env["rack.tempfiles"].length).toBe(2);
  });

  it("detect invalid multipart form data", () => {
    let input = `--AaB03x\r
content-disposition: form-data; name="huge"; filename="huge"\r
`;
    let req = makeRequest(
      MockRequest.envFor("/", {
        CONTENT_TYPE: "multipart/form-data, boundary=AaB03x",
        CONTENT_LENGTH: input.length,
        ":input": input,
      }),
    );

    expect(() => req.POST).toThrow(EOFError);

    input = `--AaB03x\r
content-disposition: form-data; name="huge"; filename="huge"\r
\r
foo\r
`;
    req = makeRequest(
      MockRequest.envFor("/", {
        CONTENT_TYPE: "multipart/form-data, boundary=AaB03x",
        CONTENT_LENGTH: input.length,
        ":input": input,
      }),
    );

    expect(() => req.POST).toThrow(EOFError);

    input = `--AaB03x\r
content-disposition: form-data; name="huge"; filename="huge"\r
\r
foo\r
`;
    req = makeRequest(
      MockRequest.envFor("/", {
        CONTENT_TYPE: "multipart/form-data, boundary=AaB03x",
        CONTENT_LENGTH: input.length,
        ":input": input,
      }),
    );

    expect(() => req.POST).toThrow(EOFError);
  });

  it("consistently raise EOFError on bad multipart form data", () => {
    const boundary = "AaB03x";
    const input = `--${boundary}\r\ncontent-disposition: form-data; name="huge"; filename="huge"\r\n`;
    const env = {
      ...makeEnv(),
      CONTENT_TYPE: `multipart/form-data; boundary=${boundary}`,
      "rack.input": new StringIO(input),
    };
    const req = makeRequest(env);
    expect(() => req.POST).toThrow(EmptyContentError);
    expect(() => req.POST).toThrow(EmptyContentError);
  });

  it("correctly parse the part name from Content-Id header", () => {
    const boundary = "AaB03x";
    const input = `--${boundary}\r\ncontent-type: text/xml; charset=utf-8\r\nContent-Id: <soap-start>\r\ncontent-transfer-encoding: 7bit\r\n\r\nfoo\r\n--${boundary}--\r\n`;
    const env = {
      ...makeEnv(),
      CONTENT_TYPE: `multipart/related; boundary=${boundary}`,
      "rack.input": new StringIO(input),
    };
    const req = makeRequest(env);
    expect(Object.keys(req.POST)).toEqual(["<soap-start>"]);
  });

  it("not try to interpret binary as utf8", () => {
    const boundary = "AaB03x";
    const binaryData = Buffer.from([0x36, 0xcf, 0x0a, 0xf8]);
    const header = `--${boundary}\r\ncontent-disposition: form-data; name="fileupload"; filename="junk.a"\r\ncontent-type: application/octet-stream\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;
    const body = Buffer.concat([
      Buffer.from(header, "binary"),
      binaryData,
      Buffer.from(footer, "binary"),
    ]);
    const env = {
      ...makeEnv(),
      CONTENT_TYPE: `multipart/form-data; boundary=${boundary}`,
      "rack.input": {
        read() {
          return body;
        },
      },
    };
    const req = makeRequest(env);
    expect(req.POST["fileupload"].tempfile.read().length).toBe(4);
  });

  it("use form_hash when form_input is a Tempfile", () => {
    const formHash = { custom: "data" };
    const rackInput = {
      read() {
        return "{foo: 'bar'}";
      },
    };
    const env = {
      ...makeEnv(),
      "rack.request.form_hash": formHash,
      "rack.request.form_input": rackInput,
      "rack.input": rackInput,
    };
    const req = makeRequest(env);
    expect(req.POST).toBe(formHash);
  });

  it("conform to the Rack spec", async () => {
    const app = (env: Record<string, any>) => {
      const content = rbInspect(makeRequest(env).POST["file"]);
      const size = content.length;
      return [200, { "content-type": "text/html", "content-length": String(size) }, [content]];
    };

    const input = `--AaB03x\r
content-disposition: form-data; name="reply"\r
\r
yes\r
--AaB03x\r
content-disposition: form-data; name="fileupload"; filename="dj.jpg"\r
content-type: image/jpeg\r
content-transfer-encoding: base64\r
\r
/9j/4AAQSkZJRgABAQAAAQABAAD//gA+Q1JFQVRPUjogZ2QtanBlZyB2MS4wICh1c2luZyBJSkcg\r
--AaB03x--\r
`;
    const res = await new MockRequest(new Lint(app)).get("/", {
      CONTENT_TYPE: "multipart/form-data, boundary=AaB03x",
      CONTENT_LENGTH: String(input.length),
      "rack.input": new StringIO(input),
    });

    expect(res.isOk).toBeTruthy();
  });

  it("parse Accept-Encoding correctly", () => {
    const parser = (x: string | null) =>
      makeRequest(MockRequest.envFor("", { HTTP_ACCEPT_ENCODING: x })).acceptEncoding;

    expect(parser(null)).toEqual([]);

    expect(parser("compress, gzip")).toEqual([
      ["compress", 1.0],
      ["gzip", 1.0],
    ]);
    expect(parser("")).toEqual([]);
    expect(parser("*")).toEqual([["*", 1.0]]);
    expect(parser("compress;q=0.5, gzip;q=1.0")).toEqual([
      ["compress", 0.5],
      ["gzip", 1.0],
    ]);
    expect(parser("gzip;q=1.0, identity; q=0.5, *;q=0")).toEqual([
      ["gzip", 1.0],
      ["identity", 0.5],
      ["*", 0],
    ]);

    expect(parser("gzip ; q=0.9")).toEqual([["gzip", 0.9]]);
    expect(parser("gzip ; deflate")).toEqual([["gzip", 1.0]]);

    expect(parser(", ")).toEqual([]);
    expect(parser(", gzip")).toEqual([["gzip", 1.0]]);
    expect(parser("gzip, ")).toEqual([["gzip", 1.0]]);
  });

  it("parse Accept-Language correctly", () => {
    const parser = (x: string | null) =>
      makeRequest(MockRequest.envFor("", { HTTP_ACCEPT_LANGUAGE: x })).acceptLanguage;

    expect(parser(null)).toEqual([]);

    expect(parser("fr, en")).toEqual([
      ["fr", 1.0],
      ["en", 1.0],
    ]);
    expect(parser("")).toEqual([]);
    expect(parser("*")).toEqual([["*", 1.0]]);
    expect(parser("fr;q=0.5, en;q=1.0")).toEqual([
      ["fr", 0.5],
      ["en", 1.0],
    ]);
    expect(parser("fr;q=1.0, en; q=0.5, *;q=0")).toEqual([
      ["fr", 1.0],
      ["en", 0.5],
      ["*", 0],
    ]);

    expect(parser("fr ; q=0.9")).toEqual([["fr", 0.9]]);
    expect(parser("fr")).toEqual([["fr", 1.0]]);

    expect(parser(", ")).toEqual([]);
    expect(parser(", en")).toEqual([["en", 1.0]]);
    expect(parser("en, ")).toEqual([["en", 1.0]]);
  });

  it("provide ip information", () => {
    expect(ip({ REMOTE_ADDR: "1.2.3.4" })).toBe("1.2.3.4");
    expect(ip({ REMOTE_ADDR: "fe80::202:b3ff:fe1e:8329" })).toBe("fe80::202:b3ff:fe1e:8329");
    expect(ip({ REMOTE_ADDR: "1.2.3.4,3.4.5.6" })).toBe("3.4.5.6");
    expect(ip({ REMOTE_ADDR: "127.0.0.1" })).toBe("127.0.0.1");
    expect(ip({ REMOTE_ADDR: "127.0.0.1,127.0.0.1" })).toBe("127.0.0.1");
  });

  it("deals with proxies", () => {
    expect(ip({ REMOTE_ADDR: "1.2.3.4", HTTP_FORWARDED: "for=3.4.5.6" })).toBe("1.2.3.4");
    expect(ip({ HTTP_X_FORWARDED_FOR: "3.4.5.6", HTTP_FORWARDED: "for=5.6.7.8" })).toBe("5.6.7.8");
    expect(
      ip({ HTTP_X_FORWARDED_FOR: "3.4.5.6", HTTP_FORWARDED: "for=5.6.7.8, for=7.8.9.0" }),
    ).toBe("7.8.9.0");
    expect(ip({ REMOTE_ADDR: "1.2.3.4", HTTP_X_FORWARDED_FOR: "3.4.5.6" })).toBe("1.2.3.4");
    expect(ip({ REMOTE_ADDR: "1.2.3.4", HTTP_X_FORWARDED_FOR: "unknown" })).toBe("1.2.3.4");
    expect(ip({ REMOTE_ADDR: "127.0.0.1", HTTP_X_FORWARDED_FOR: "3.4.5.6" })).toBe("3.4.5.6");
    expect(ip({ HTTP_X_FORWARDED_FOR: "unknown,3.4.5.6" })).toBe("3.4.5.6");
    expect(ip({ HTTP_X_FORWARDED_FOR: "192.168.0.1,3.4.5.6" })).toBe("3.4.5.6");
    expect(ip({ HTTP_X_FORWARDED_FOR: "10.0.0.1,3.4.5.6" })).toBe("3.4.5.6");
    expect(ip({ HTTP_X_FORWARDED_FOR: "10.0.0.1, 10.0.0.1, 3.4.5.6" })).toBe("3.4.5.6");
    expect(ip({ HTTP_X_FORWARDED_FOR: "127.0.0.1, 3.4.5.6" })).toBe("3.4.5.6");

    expect(ip({ HTTP_X_FORWARDED_FOR: "[2001:db8:cafe::17]:47011" })).toBe("2001:db8:cafe::17");
    expect(ip({ HTTP_FORWARDED: 'for="[2001:db8:cafe::17]:47011"' })).toBe("2001:db8:cafe::17");
    expect(ip({ HTTP_X_FORWARDED_FOR: "1.2.3.4, [2001:db8:cafe::17]:47011" })).toBe(
      "2001:db8:cafe::17",
    );

    expect(ip({ HTTP_X_FORWARDED_FOR: "192.0.2.43:47011" })).toBe("192.0.2.43");
    expect(ip({ HTTP_X_FORWARDED_FOR: "1.2.3.4, 192.0.2.43:47011" })).toBe("192.0.2.43");

    expect(ip({ HTTP_X_FORWARDED_FOR: "unknown,192.168.0.1" })).toBe("unknown");
    expect(ip({ HTTP_X_FORWARDED_FOR: "other,unknown,192.168.0.1" })).toBe("unknown");
    expect(ip({ HTTP_X_FORWARDED_FOR: "unknown,localhost,192.168.0.1" })).toBe("unknown");
    expect(ip({ HTTP_X_FORWARDED_FOR: "9.9.9.9, 3.4.5.6, 10.0.0.1, 172.31.4.4" })).toBe("3.4.5.6");
    expect(ip({ HTTP_X_FORWARDED_FOR: `::1,${IPV6}` })).toBe(IPV6);
    expect(ip({ HTTP_X_FORWARDED_FOR: `${IPV6},::1` })).toBe(IPV6);
    expect(ip({ HTTP_X_FORWARDED_FOR: `${PRIVATE_IPV6},${IPV6}` })).toBe(IPV6);
    expect(ip({ HTTP_X_FORWARDED_FOR: `${IPV6},${PRIVATE_IPV6}` })).toBe(IPV6);
    expect(ip({ HTTP_X_FORWARDED_FOR: "1.1.1.1, 127.0.0.1", HTTP_CLIENT_IP: "1.1.1.1" })).toBe(
      "1.1.1.1",
    );
    expect(ip({ HTTP_X_FORWARDED_FOR: "8.8.8.8, 9.9.9.9" })).toBe("9.9.9.9");
    expect(ip({ HTTP_X_FORWARDED_FOR: "8.8.8.8, fe80::202:b3ff:fe1e:8329" })).toBe(
      "fe80::202:b3ff:fe1e:8329",
    );

    expect(ip({ REMOTE_ADDR: "unix", HTTP_X_FORWARDED_FOR: "3.4.5.6" })).toBe("3.4.5.6");
    expect(ip({ REMOTE_ADDR: "unix:/tmp/foo", HTTP_X_FORWARDED_FOR: "3.4.5.6" })).toBe("3.4.5.6");
  });

  it("not allow IP spoofing via Client-IP and X-Forwarded-For headers", () => {
    expect(
      ip({ HTTP_X_FORWARDED_FOR: "6.6.6.6, 2.2.2.3, 192.168.0.7", HTTP_CLIENT_IP: "6.6.6.6" }),
    ).toBe("2.2.2.3");
  });

  it("preserves ip for trusted proxy chain", () => {
    expect(
      ip({ HTTP_X_FORWARDED_FOR: "192.168.0.11, 192.168.0.7", HTTP_CLIENT_IP: "127.0.0.1" }),
    ).toBe("192.168.0.11");
  });

  it("uses a custom trusted proxy filter", () => {
    const oldIp = Request.ipFilter;
    Request.ipFilter = (ip: string | undefined) => ip === "foo";
    const req = makeRequest(MockRequest.envFor("/"));
    expect(req.trustedProxy("foo")).toBeTruthy();
    Request.ipFilter = oldIp;
  });

  it("regards local addresses as proxies", () => {
    const req = makeReq("/");
    expect(req.trustedProxy("127.0.0.1")).toBe(true);
    expect(req.trustedProxy("127.000.000.001")).toBe(true);
    expect(req.trustedProxy("127.0.0.6")).toBe(true);
    expect(req.trustedProxy("127.0.0.30")).toBe(true);
    expect(req.trustedProxy("10.0.0.1")).toBe(true);
    expect(req.trustedProxy("10.000.000.001")).toBe(true);
    expect(req.trustedProxy("172.16.0.1")).toBe(true);
    expect(req.trustedProxy("172.20.0.1")).toBe(true);
    expect(req.trustedProxy("172.30.0.1")).toBe(true);
    expect(req.trustedProxy("172.31.0.1")).toBe(true);
    expect(req.trustedProxy("172.31.000.001")).toBe(true);
    expect(req.trustedProxy("192.168.0.1")).toBe(true);
    expect(req.trustedProxy("192.168.000.001")).toBe(true);
    expect(req.trustedProxy("::1")).toBe(true);
    expect(req.trustedProxy("fd00::")).toBe(true);
    expect(req.trustedProxy("FD00::")).toBe(true);
    expect(req.trustedProxy("localhost")).toBe(true);
    expect(req.trustedProxy("unix")).toBe(true);
    expect(req.trustedProxy("unix:/tmp/sock")).toBe(true);

    expect(req.trustedProxy("unix.example.org")).toBe(false);
    expect(req.trustedProxy("example.org\n127.0.0.1")).toBe(false);
    expect(req.trustedProxy("127.0.0.1\nexample.org")).toBe(false);
    expect(req.trustedProxy("127.256.0.1")).toBe(false);
    expect(req.trustedProxy("127.0.256.1")).toBe(false);
    expect(req.trustedProxy("127.0.0.256")).toBe(false);
    expect(req.trustedProxy("127.0.0.300")).toBe(false);
    expect(req.trustedProxy("10.256.0.1")).toBe(false);
    expect(req.trustedProxy("10.0.256.1")).toBe(false);
    expect(req.trustedProxy("10.0.0.256")).toBe(false);
    expect(req.trustedProxy("11.0.0.1")).toBe(false);
    expect(req.trustedProxy("11.000.000.001")).toBe(false);
    expect(req.trustedProxy("172.15.0.1")).toBe(false);
    expect(req.trustedProxy("172.32.0.1")).toBe(false);
    expect(req.trustedProxy("172.16.256.1")).toBe(false);
    expect(req.trustedProxy("172.16.0.256")).toBe(false);
    expect(req.trustedProxy("2001:470:1f0b:18f8::1")).toBe(false);
  });

  it("sets the default session to an empty hash", () => {
    const req = makeRequest(MockRequest.envFor("http://example.com:8080/"));
    const session = req.session;
    expect(session).toEqual({});
    expect(req.env["rack.session"]).toBe(session);
  });

  it("sets the default session options to an empty hash", () => {
    const req = makeRequest(MockRequest.envFor("http://example.com:8080/"));
    const sessionOptions = req.sessionOptions;
    expect(sessionOptions).toEqual({});
    expect(req.env["rack.session.options"]).toBe(sessionOptions);
    expect(req.sessionOptions).toEqual({});
  });

  class MyRequest extends Request {
    get params(): Record<string, any> {
      return { foo: "bar" };
    }
  }

  it("allow subclass request to be instantiated after parent request", () => {
    const env = MockRequest.envFor("/?foo=bar");

    const req1 = makeRequest(env);
    expect(req1.GET).toEqual({ foo: "bar" });
    expect(req1.params).toEqual({ foo: "bar" });

    const req2 = new MyRequest(env);
    expect(req2.GET).toEqual({ foo: "bar" });
    expect(req2.params).toEqual({ foo: "bar" });
  });

  it("allow parent request to be instantiated after subclass request", () => {
    const env = MockRequest.envFor("/?foo=bar");

    const req1 = new MyRequest(env);
    expect(req1.GET).toEqual({ foo: "bar" });
    expect(req1.params).toEqual({ foo: "bar" });

    const req2 = makeRequest(env);
    expect(req2.GET).toEqual({ foo: "bar" });
    expect(req2.params).toEqual({ foo: "bar" });
  });

  it("raise TypeError every time if request parameters are broken", () => {
    const brokenQuery = MockRequest.envFor("/?foo%5B%5D=0&foo%5Bbar%5D=1");
    const req = makeRequest(brokenQuery);
    expect(() => req.GET).toThrow(TypeError);
    expect(() => req.params).toThrow(TypeError);
  });

  it("not strip '' => '' => '' escaped character from parameters when accessed as string", () => {
    for (let a = 0x20; a < 0x7e; a++) {
      const b = String.fromCharCode(a);
      const c = escape(b);
      const url = `/?foo=${c}bar${c}`;
      const env = MockRequest.envFor(url);
      const req2 = makeRequest(env);
      expect(req2.GET).toEqual({ foo: `${b}bar${b}` });
      expect(req2.params).toEqual({ foo: `${b}bar${b}` });
    }
  });

  it("handles ASCII NUL input of  bytes", () => {
    const length = 2 ** 16;
    const mr = MockRequest.envFor("/", {
      REQUEST_METHOD: "POST",
      ":input": "\0".repeat(length),
    });
    const req = makeRequest(mr);
    expect(req.queryString).toBe("");
    expect(isEmpty(req.GET)).toBeTruthy();
    const keys = Object.keys(req.POST);
    expect(keys.length).toBe(1);
    expect(keys[0].length).toBe(length - 1);
    expect(keys[0]).toBe("\0".repeat(length - 1));
  });

  it("Env sets @env on initialization", () => {
    const c = class {
      env: Record<string, any>;

      constructor(env: Record<string, any>) {
        this.env = env;
      }
    };
    include(c, Env);
    const h = {};
    expect(new c(h).env).toBe(h);
  });

  it("return values for the keys in the order given from values_at", () => {
    const req = makeRequest(MockRequest.envFor("?foo=baz&wun=der&bar=ful"));

    captureWarnings((warnings) => {
      expect(req.valuesAt("foo")).toEqual(["baz"]);
      expect(req.valuesAt("foo", "wun")).toEqual(["baz", "der"]);
      expect(req.valuesAt("bar", "foo", "wun")).toEqual(["ful", "baz", "der"]);
      expect(String(warnings.at(-1)![0])).toMatch(/deprecated/);
    });

    // eslint-disable-next-line vitest/no-conditional-in-test -- mirrors spec_request.rb:808 `next if self.class == TestProxyRequest`
    if (req.isDelegate()) return;

    captureWarnings((warnings) => {
      expect(req.valuesAt("foo")).toEqual(["baz"]);
      expect(warnings.pop()).toEqual([
        "Request#values_at is deprecated and will be removed in a future version of Rack. Please use request.params.values_at instead",
        { uplevel: 1 },
      ]);
    });
  });
}
describe("RackRequestTest", () => {
  class NonDelegate extends Request {
    isDelegate(): boolean {
      return false;
    }

    override queryParser = (): QueryParser =>
      QueryParser.makeDefault(paramDepthLimit(), { bytesizeLimit: 2 ** 30 });
  }

  rackRequestTests((env) => new NonDelegate(env));

  describe("TestProxyRequest", () => {
    /* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Rack::Request::Helpers` (`spec_request.rb:1924`). */
    class DelegateRequest {
      req: Request;

      constructor(req: Request) {
        this.req = req;
      }

      get env(): Record<string, any> {
        return this.req.env;
      }

      hasHeader(name: string): boolean {
        return this.req.hasHeader(name);
      }

      getHeader(name: string): any {
        return this.req.getHeader(name);
      }

      fetchHeader(name: string, block?: (key: string) => any): any {
        return block ? this.req.fetchHeader(name, block) : this.req.fetchHeader(name);
      }

      eachHeader(callback: (key: string, value: any) => void): void {
        this.req.eachHeader(callback);
      }

      setHeader(name: string, v: any): any {
        return this.req.setHeader(name, v);
      }

      addHeader(key: string, v: string | null): any {
        return this.req.addHeader(key, v);
      }

      deleteHeader(name: string): any {
        return this.req.deleteHeader(name);
      }

      valuesAt(...keys: string[]): any[] {
        return this.req.valuesAt(...keys);
      }

      isDelegate(): boolean {
        return true;
      }

      queryParser(): QueryParser {
        return QueryParser.makeDefault(paramDepthLimit(), { bytesizeLimit: 2 ** 30 });
      }
    }
    include(DelegateRequest, Helpers);
    /* eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- see above. */
    interface DelegateRequest extends Omit<
      Helpers,
      "env" | "getHeader" | "setHeader" | "fetchHeader"
    > {}

    rackRequestTests((env) => new DelegateRequest(new NonDelegate(env)));
  });
});
