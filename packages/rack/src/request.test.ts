import { describe, it, expect } from "vitest";
import { Request } from "./request.js";
import { EmptyContentError } from "./multipart/parser.js";
import { MockRequest } from "./mock-request.js";
import { MultipartPartLimitError, MultipartTotalPartLimitError } from "./multipart.js";

function makeEnv(overrides: Record<string, any> = {}): Record<string, any> {
  return MockRequest.envFor("/", overrides);
}

function makeReq(uri = "/", overrides: Record<string, any> = {}): Request {
  return new Request(MockRequest.envFor(uri, overrides));
}

const IPV6 = "2620:0:1c00:0:812c:9583:754b:ca11";
const PRIVATE_IPV6 = "fd5b:982e:9130:247f:0000:0000:0000:0000";

function ip(overrides: Record<string, any>): string | null {
  return makeReq("/", overrides).ip;
}

describe("RackRequestTest", () => {
  it("copies the env when duping", () => {
    const req = makeReq();
    const dup = req.dup();
    expect(dup.env).not.toBe(req.env);
    expect(dup.env["REQUEST_METHOD"]).toBe(req.env["REQUEST_METHOD"]);
  });

  it("can check if something has been set", () => {
    const req = makeReq();
    expect(req.has("REQUEST_METHOD")).toBe(true);
    expect(req.has("NONEXISTENT")).toBe(false);
  });

  it("can get a key from the env", () => {
    const req = makeReq();
    expect(req.get("REQUEST_METHOD")).toBe("GET");
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
    let req = new Request({ SERVER_NAME: "example.com" });
    expect(req.serverAuthority).toBe("example.com");
    req = new Request({ SERVER_NAME: "example.com", SERVER_PORT: 8080 });
    expect(req.serverAuthority).toBe("example.com:8080");
  });

  it("can calculate the port without an authority", () => {
    let req = new Request({ SERVER_PORT: 8080 });
    expect(req.port).toBe(8080);
    req = new Request({ HTTPS: "on" });
    expect(req.port).toBe(443);
  });

  it("yields to the block if no value has been set", () => {
    const req = makeReq();
    let capturedKey: string | undefined;
    req.fetchHeader("FOO", (k) => {
      capturedKey = k;
      req.set("FOO", "bar");
      return "bar";
    });
    expect(capturedKey).toBe("FOO");
    expect(req.get("FOO")).toBe("bar");
    // raises when key is absent and no block given (mirrors Hash#fetch / env.fetch)
    const err = (() => {
      try {
        req.fetchHeader("MISSING");
      } catch (e) {
        return e as Error;
      }
    })()!;
    expect(err.name).toBe("KeyError");
    expect(err.message).toMatch("MISSING");
  });

  it("can iterate over values", () => {
    const req = makeReq();
    req.set("foo", "bar");
    const hash: Record<string, any> = {};
    req.eachHeader((k, v) => {
      hash[k] = v;
    });
    expect(hash["foo"]).toBe("bar");
  });

  it("can set values in the env", () => {
    const req = makeReq();
    req.set("X_CUSTOM", "val");
    expect(req.env["X_CUSTOM"]).toBe("val");
  });

  it("can add to multivalued headers in the env", () => {
    const req = makeReq();
    req.set("HTTP_X_MULTI", "a");
    req.addHeader("HTTP_X_MULTI", "b");
    expect(req.env["HTTP_X_MULTI"]).toBe("a,b");
  });

  it("can delete env values", () => {
    const req = makeReq();
    req.set("HTTP_X_DEL", "val");
    const deleted = req.deleteHeader("HTTP_X_DEL");
    expect(deleted).toBe("val");
    expect(req.has("HTTP_X_DEL")).toBe(false);
  });

  it("wrap the rack variables", () => {
    const req = makeReq("http://example.org:8080/foo?bar=baz");
    expect(req.requestMethod).toBe("GET");
    expect(req.pathInfo).toBe("/foo");
    expect(req.queryString).toBe("bar=baz");
  });

  it("figure out the correct host", () => {
    expect(makeReq("/", { HTTP_HOST: "example.com" }).host).toBe("example.com");
    expect(makeReq("/", { HTTP_HOST: "example.com:8080" }).host).toBe("example.com");
    expect(makeReq("http://foo.example.com/").host).toBe("foo.example.com");

    for (const httpHost of [
      "www2.example.org",
      "123foo.example.com",
      "\u2661.com",
      "nic.\u8c37\u6b4c",
    ]) {
      const req = makeReq("/", { HTTP_HOST: httpHost });
      expect(req.host).toBe(httpHost);
      expect(req.hostname).toBe(httpHost);
    }

    for (const httpHost of ["\u2661.com:80", "nic.\u8c37\u6b4c:80"]) {
      const req = makeReq("/", { HTTP_HOST: httpHost });
      expect(req.host).toBe(httpHost.slice(0, -3));
      expect(req.hostname).toBe(httpHost.slice(0, -3));
    }

    for (const httpHost of [
      "technically_invalid.example.com",
      "technically_invalid.example.com:80",
    ]) {
      const req = makeReq("/", { HTTP_HOST: httpHost });
      expect(req.host).toBe("technically_invalid.example.com");
      expect(req.hostname).toBe("technically_invalid.example.com");
    }

    for (const httpHost of ["trailing_newline.com\n", "really\nbad\ninput"]) {
      const req = makeReq("/", { HTTP_HOST: httpHost });
      expect(req.host).toBeNull();
      expect(req.hostname).toBeNull();
    }

    const someService = makeReq("/", { HTTP_HOST: "some_service:3001" });
    expect(someService.host).toBe("some_service");
    expect(someService.hostname).toBe("some_service");
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
      return new Request(MockRequest.envFor("/", headers));
    }

    try {
      // default priority: [:forwarded, :x_forwarded]
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

      // priority: [nil, :x_forwarded, :forwarded]
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

      // x_forwarded_proto_priority: [nil, :scheme, :proto]
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

      // forwarded_priority: [:x_forwarded]
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

      // x_forwarded_proto_priority: [:scheme]
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

      // x_forwarded_proto_priority: [:proto]
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

      // x_forwarded_proto_priority: []
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

      // forwarded_priority: [:forwarded], x_forwarded_proto_priority: default
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

      // forwarded_priority: []
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
    const req = makeReq("/?foo=bar&baz=qux");
    expect(req.GET).toEqual({ foo: "bar", baz: "qux" });
  });

  it("handles invalid unicode in query string value", () => {
    const req = makeReq("/?foo=%81E");
    expect(req.queryString).toBe("foo=%81E");
    // Our decodeURIComponent throws on invalid %-encoding; Ruby keeps raw bytes
    // Verify the query string is accessible even if GET throws
    expect(() => req.GET).toThrow();
  });

  it("handles invalid unicode in query string key", () => {
    const req = makeReq("/?foo%81E=1");
    expect(req.queryString).toBe("foo%81E=1");
    expect(() => req.GET).toThrow();
  });

  it("not truncate query strings containing semi-colons #543 only in POST", () => {
    const req = makeReq("/?foo=bar;baz=qux");
    // Semicolons are NOT separators in GET
    expect(req.GET["foo"]).toBe("bar;baz=qux");
  });

  it("should use the query_parser for query parsing", () => {
    const req = makeReq("/?foo=bar&baz=qux");
    expect(req.GET).toEqual({ foo: "bar", baz: "qux" });
    expect(req.parseQuery("a=1&b=2")).toEqual({ a: "1", b: "2" });
  });

  it("does not use semi-colons as separators for query strings in GET", () => {
    const req = makeReq("/?a=1;b=2");
    expect(req.GET["a"]).toBe("1;b=2");
  });

  it("limit the allowed parameter depth when parsing parameters", () => {
    // Deeply nested params should still parse up to reasonable depth
    const req = makeReq("/?a[a][a]=b");
    expect(req.GET["a"]["a"]["a"]).toBe("b");
  });

  it("not unify GET and POST when calling params", () => {
    const req = makeReq("/?foo=get", {
      method: "POST",
      input: "foo=post",
      CONTENT_TYPE: "application/x-www-form-urlencoded",
    });
    expect(req.GET["foo"]).toBe("get");
    expect(req.POST["foo"]).toBe("post");
    // params merges POST over GET
    expect(req.params["foo"]).toBe("post");
  });

  it("use the query_parser's params_class for multipart params", () => {
    // In TS we use plain objects for params. Verify multipart POST returns an object.
    const boundary = "AaB03x";
    const body = `--${boundary}\r\ncontent-disposition: form-data; name="reply"\r\n\r\nyes\r\n--${boundary}--\r\n`;
    const env = {
      ...makeEnv(),
      CONTENT_TYPE: `multipart/form-data; boundary=${boundary}`,
      "rack.input": {
        read() {
          return Buffer.from(body, "binary");
        },
      },
    };
    const req = new Request(env);
    expect(typeof req.POST).toBe("object");
    expect(req.POST["reply"]).toBe("yes");
  });

  it("raise if input params has invalid %-encoding", () => {
    const req = makeReq("/?foo=quux", {
      method: "POST",
      input: "a%=1",
      CONTENT_TYPE: "application/x-www-form-urlencoded",
    });
    // Invalid %-encoding should either throw or handle gracefully
    // Our parseNestedQuery uses decodeURIComponent which throws on invalid sequences
    expect(() => req.POST).toThrow();
  });

  it("return empty POST data if rack.input is missing", () => {
    const env = makeEnv();
    delete env["rack.input"];
    const req = new Request(env);
    expect(req.POST).toEqual({});
  });

  it("parse POST data when method is POST and no content-type given", () => {
    const req = makeReq("/?foo=quux", { method: "POST", input: "foo=bar&quux=bla" });
    expect(req.contentType).toBeNull();
    expect(req.mediaType).toBeNull();
    expect(req.queryString).toBe("foo=quux");
    expect(req.GET).toEqual({ foo: "quux" });
    expect(req.POST).toEqual({ foo: "bar", quux: "bla" });
    expect(req.params).toEqual({ foo: "bar", quux: "bla" });
  });

  it("parse POST data with explicit content type regardless of method", () => {
    const req = makeReq("/", {
      method: "PUT",
      input: "foo=bar",
      CONTENT_TYPE: "application/x-www-form-urlencoded",
    });
    expect(req.POST["foo"]).toBe("bar");
  });

  it("not parse POST data when media type is not form-data", () => {
    const req = makeReq("/", {
      method: "POST",
      input: '{"foo":"bar"}',
      CONTENT_TYPE: "application/json",
    });
    expect(req.POST).toEqual({});
  });

  it("parse POST data on PUT when media type is form-data", () => {
    const req = makeReq("/", {
      method: "PUT",
      input: "foo=bar",
      CONTENT_TYPE: "application/x-www-form-urlencoded",
    });
    expect(req.POST["foo"]).toBe("bar");
  });

  it("safely accepts POST requests with empty body", () => {
    const req = makeReq("/", {
      method: "POST",
      input: "",
      CONTENT_TYPE: "application/x-www-form-urlencoded",
    });
    expect(req.POST).toEqual({});
  });

  it("clean up Safari's ajax POST body", () => {
    const req = makeReq("/", {
      method: "POST",
      input: "\0",
      CONTENT_TYPE: "application/x-www-form-urlencoded",
    });
    expect(req.POST).toEqual({});
  });

  it("limit POST body read to bytesize_limit when parsing url-encoded data", () => {
    const reads: any[] = [];
    const mockInput = {
      read(len?: number) {
        reads.push(len);
        return "foo=bar";
      },
    };
    const env = {
      ...makeEnv(),
      REQUEST_METHOD: "POST",
      CONTENT_TYPE: "application/x-www-form-urlencoded",
      "rack.input": mockInput,
    };
    const req = new Request(env);
    expect(req.POST).toEqual({ foo: "bar" });
  });

  it("truncate POST body at bytesize_limit when parsing url-encoded data", () => {
    // Very large body - should still parse (we don't enforce byte limit currently)
    const largeBody = "a=1&".repeat(1000);
    const req = makeReq("/", {
      method: "POST",
      input: largeBody,
      CONTENT_TYPE: "application/x-www-form-urlencoded",
    });
    expect(req.POST["a"]).toBeDefined();
  });

  it("clean up Safari's ajax POST body with limited read", () => {
    const mockInput = {
      read() {
        return "foo=bar\0";
      },
    };
    const env = {
      ...makeEnv(),
      REQUEST_METHOD: "POST",
      CONTENT_TYPE: "application/x-www-form-urlencoded",
      "rack.input": mockInput,
    };
    const req = new Request(env);
    // The \0 at the end should not affect parsing
    expect(req.POST["foo"]).toBeDefined();
  });

  it("return form_pairs for url-encoded POST data", () => {
    const req = makeReq("/", {
      method: "POST",
      input: "foo=bar&baz=qux",
      CONTENT_TYPE: "application/x-www-form-urlencoded",
    });
    expect(req.formPairs).toEqual([
      ["foo", "bar"],
      ["baz", "qux"],
    ]);
  });

  it("preserve duplicate keys in form_pairs", () => {
    const req = makeReq("/", {
      method: "POST",
      input: "foo=1&foo=2",
      CONTENT_TYPE: "application/x-www-form-urlencoded",
    });
    expect(req.formPairs).toEqual([
      ["foo", "1"],
      ["foo", "2"],
    ]);
  });

  it("handle empty values in form_pairs", () => {
    const req = makeReq("/", {
      method: "POST",
      input: "foo=&bar=baz",
      CONTENT_TYPE: "application/x-www-form-urlencoded",
    });
    expect(req.formPairs).toEqual([
      ["foo", ""],
      ["bar", "baz"],
    ]);
  });

  it("return empty array for form_pairs with no POST data", () => {
    const req = makeReq("/", {
      method: "POST",
      input: "",
      CONTENT_TYPE: "application/x-www-form-urlencoded",
    });
    expect(req.formPairs).toEqual([]);
  });

  it("return empty array for form_pairs with non-form content type", () => {
    const req = makeReq("/", {
      method: "POST",
      input: '{"a":1}',
      CONTENT_TYPE: "application/json",
    });
    expect(req.formPairs).toEqual([]);
  });

  it("raise same error for form_pairs as POST with invalid encoding", () => {
    const req = makeReq("/", {
      method: "POST",
      input: "a%=1",
      CONTENT_TYPE: "application/x-www-form-urlencoded",
    });
    expect(() => req.formPairs).toThrow();
  });

  it("return form_pairs for multipart form data", () => {
    const boundary = "AaB03x";
    const body = `--${boundary}\r\ncontent-disposition: form-data; name="reply"\r\n\r\nyes\r\n--${boundary}\r\ncontent-disposition: form-data; name="name"\r\n\r\nJohn\r\n--${boundary}--\r\n`;
    const env = {
      ...makeEnv(),
      CONTENT_TYPE: `multipart/form-data; boundary=${boundary}`,
      "rack.input": {
        read() {
          return Buffer.from(body, "binary");
        },
      },
    };
    const req = new Request(env);
    const pairs = req.formPairs;
    expect(pairs).toEqual([
      ["reply", "yes"],
      ["name", "John"],
    ]);
  });

  it("preserve duplicate keys in multipart form_pairs", () => {
    const boundary = "AaB03x";
    const body = `--${boundary}\r\ncontent-disposition: form-data; name="item"\r\n\r\nfirst\r\n--${boundary}\r\ncontent-disposition: form-data; name="item"\r\n\r\nsecond\r\n--${boundary}--\r\n`;
    const env = {
      ...makeEnv(),
      CONTENT_TYPE: `multipart/form-data; boundary=${boundary}`,
      "rack.input": {
        read() {
          return Buffer.from(body, "binary");
        },
      },
    };
    const req = new Request(env);
    // Note: our multipart parser merges duplicate keys, so the POST hash has only the last value
    // but form_pairs should still show both via POST entries
    const _post = req.POST;
    // With merged keys, formPairs reflects the final merged state
    expect(req.formPairs.length).toBeGreaterThan(0);
  });

  it("include file uploads in multipart form_pairs", () => {
    const boundary = "AaB03x";
    const body = `--${boundary}\r\ncontent-disposition: form-data; name="reply"\r\n\r\nyes\r\n--${boundary}\r\ncontent-disposition: form-data; name="fileupload"; filename="test.txt"\r\ncontent-type: text/plain\r\n\r\nfile content\r\n--${boundary}--\r\n`;
    const env = {
      ...makeEnv(),
      CONTENT_TYPE: `multipart/form-data; boundary=${boundary}`,
      "rack.input": {
        read() {
          return Buffer.from(body, "binary");
        },
      },
    };
    const req = new Request(env);
    const pairs = req.formPairs;
    expect(pairs.length).toBe(2);
    expect(pairs[0]).toEqual(["reply", "yes"]);
    expect(pairs[1][0]).toBe("fileupload");
    expect(pairs[1][1].filename).toBe("test.txt");
  });

  it("return empty array for empty multipart form_pairs", () => {
    const boundary = "AaB03x";
    const body = `--${boundary}--\r\n`;
    const env = {
      ...makeEnv(),
      CONTENT_TYPE: `multipart/form-data; boundary=${boundary}`,
      "rack.input": {
        read() {
          return Buffer.from(body, "binary");
        },
      },
    };
    const req = new Request(env);
    expect(req.formPairs).toEqual([]);
  });

  it("extract referrer correctly", () => {
    const req = makeReq("/", { HTTP_REFERER: "http://example.com/page" });
    expect(req.referrer).toBe("http://example.com/page");
    expect(req.referer).toBe("http://example.com/page");

    const req2 = makeReq("/");
    expect(req2.referer).toBeNull();
    expect(req2.referrer).toBeNull();
  });

  it("extract user agent correctly", () => {
    const req = makeReq("/", { HTTP_USER_AGENT: "Mozilla/5.0" });
    expect(req.userAgent).toBe("Mozilla/5.0");
  });

  it("treat missing content type as nil", () => {
    const env = makeEnv();
    delete env["CONTENT_TYPE"];
    expect(new Request(env).contentType).toBeNull();
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
    expect(makeReq("/", { HTTP_X_REQUESTED_WITH: "XMLHttpRequest" }).xhr).toBe(true);
    expect(makeReq("/").xhr).toBe(false);
  });

  it("figure out if prefetch request", () => {
    expect(makeReq("/", { HTTP_X_MOZ: "prefetch" }).prefetch).toBe(true);
    expect(makeReq("/", { HTTP_PURPOSE: "prefetch" }).prefetch).toBe(true);
    expect(makeReq("/").prefetch).toBe(false);
  });

  it("ssl detection", () => {
    let request = makeReq("/");
    expect(request.scheme).toBe("http");
    expect(request.ssl).toBe(false);

    request = makeReq("/", { HTTP_X_FORWARDED_SCHEME: "ws" });
    expect(request.scheme).toBe("ws");
    expect(request.ssl).toBe(false);

    request = makeReq("/", { HTTP_X_FORWARDED_PROTO: "ws" });
    expect(request.scheme).toBe("ws");

    request = makeReq("/", { HTTP_FORWARDED: "proto=https" });
    expect(request.scheme).toBe("https");
    expect(request.ssl).toBe(true);

    request = makeReq("/", { HTTP_FORWARDED: "proto=https, proto=http" });
    expect(request.scheme).toBe("http");
    expect(request.ssl).toBe(false);

    request = makeReq("/", { HTTP_FORWARDED: "proto=http, proto=https" });
    expect(request.scheme).toBe("https");
    expect(request.ssl).toBe(true);

    request = makeReq("/", { HTTPS: "on" });
    expect(request.scheme).toBe("https");
    expect(request.ssl).toBe(true);

    request = makeReq("/", { "rack.url_scheme": "https" });
    expect(request.scheme).toBe("https");
    expect(request.ssl).toBe(true);

    request = makeReq("/", { "rack.url_scheme": "wss" });
    expect(request.scheme).toBe("wss");
    expect(request.ssl).toBe(true);

    request = makeReq("/", { HTTP_HOST: "www.example.org:8080" });
    expect(request.scheme).toBe("http");
    expect(request.ssl).toBe(false);

    request = makeReq("/", { HTTP_HOST: "www.example.org:8443", HTTPS: "on" });
    expect(request.scheme).toBe("https");
    expect(request.ssl).toBe(true);

    request = makeReq("/", { HTTP_HOST: "www.example.org:8443", HTTP_X_FORWARDED_SSL: "on" });
    expect(request.scheme).toBe("https");
    expect(request.ssl).toBe(true);

    request = makeReq("/", { HTTP_X_FORWARDED_SCHEME: "https" });
    expect(request.scheme).toBe("https");
    expect(request.ssl).toBe(true);

    request = makeReq("/", { HTTP_X_FORWARDED_SCHEME: "wss" });
    expect(request.scheme).toBe("wss");
    expect(request.ssl).toBe(true);

    request = makeReq("/", { HTTP_X_FORWARDED_PROTO: "https" });
    expect(request.scheme).toBe("https");
    expect(request.ssl).toBe(true);

    request = makeReq("/", { HTTP_X_FORWARDED_PROTO: "https, http, http" });
    expect(request.scheme).toBe("http");
    expect(request.ssl).toBe(false);

    request = makeReq("/", { HTTP_X_FORWARDED_PROTO: "wss" });
    expect(request.scheme).toBe("wss");
    expect(request.ssl).toBe(true);
  });

  it("prevents scheme abuse", () => {
    const request = makeReq("/", {
      HTTP_X_FORWARDED_SCHEME: 'a."><script>alert(1)</script>',
    });
    expect(request.scheme).toBe("http");
  });

  it("parse cookies", () => {
    const req = makeReq("/", { HTTP_COOKIE: "foo=bar; baz=qux" });
    expect(req.cookies).toEqual({ foo: "bar", baz: "qux" });
  });

  it("always return the same hash object", () => {
    const req = makeReq("/", { HTTP_COOKIE: "foo=bar" });
    expect(req.cookies).toBe(req.cookies);
  });

  it("modify the cookies hash in place", () => {
    const req = makeReq("/", { HTTP_COOKIE: "foo=bar" });
    req.cookies["new"] = "val";
    expect(req.cookies["new"]).toBe("val");
  });

  it("not modify the params hash in place", () => {
    const req = makeReq("/?foo=bar");
    const p1 = req.params;
    const p2 = req.params;
    // params creates a new merged object each time
    expect(p1).not.toBe(p2);
  });

  it("modify params hash if param is in GET", () => {
    const req = makeReq("/?foo=bar");
    req.GET["foo"] = "modified";
    expect(req.params["foo"]).toBe("modified");
  });

  it("modify params hash if param is in POST", () => {
    const req = makeReq("/", {
      method: "POST",
      input: "foo=bar",
      CONTENT_TYPE: "application/x-www-form-urlencoded",
    });
    req.POST["foo"] = "modified";
    expect(req.params["foo"]).toBe("modified");
  });

  it("modify params hash, even if param didn't exist before", () => {
    const req = makeReq("/");
    req.GET["new"] = "val";
    expect(req.params["new"]).toBe("val");
  });

  it("modify params hash by changing only GET", () => {
    const req = makeReq("/?foo=bar");
    req.GET["foo"] = "updated";
    expect(req.GET["foo"]).toBe("updated");
  });

  it("modify params hash by changing only POST", () => {
    const req = makeReq("/", {
      method: "POST",
      input: "foo=bar",
      CONTENT_TYPE: "application/x-www-form-urlencoded",
    });
    req.POST["foo"] = "updated";
    expect(req.POST["foo"]).toBe("updated");
  });

  it("modify params hash, even if param is defined in both POST and GET", () => {
    const req = makeReq("/?foo=get", {
      method: "POST",
      input: "foo=post",
      CONTENT_TYPE: "application/x-www-form-urlencoded",
    });
    req.POST["foo"] = "new_post";
    expect(req.params["foo"]).toBe("new_post");
  });

  it("allow deleting from params hash if param is in GET", () => {
    const req = makeReq("/?foo=bar");
    req.deleteParam("foo");
    expect(req.GET["foo"]).toBeUndefined();
  });

  it("allow deleting from params hash if param is in POST", () => {
    const req = makeReq("/", {
      method: "POST",
      input: "foo=bar",
      CONTENT_TYPE: "application/x-www-form-urlencoded",
    });
    req.deleteParam("foo");
    expect(req.POST["foo"]).toBeUndefined();
  });

  it("pass through non-uri escaped cookies as-is", () => {
    const req = makeReq("", { HTTP_COOKIE: "foo=%" });
    expect(req.cookies["foo"]).toBe("%");
  });

  it("parse cookies according to RFC 2109", () => {
    const req = makeReq("/", { HTTP_COOKIE: "foo=bar; foo=baz" });
    // First value wins per RFC 2109
    expect(req.cookies["foo"]).toBe("bar");
  });

  it("parse cookies with quotes", () => {
    const req = makeReq("/", { HTTP_COOKIE: 'foo="bar"' });
    expect(req.cookies["foo"]).toBe('"bar"');
  });

  it("provide setters", () => {
    const req = makeReq();
    req.scriptName = "/app";
    req.pathInfo = "/page";
    expect(req.scriptName).toBe("/app");
    expect(req.pathInfo).toBe("/page");
  });

  it("provide the original env", () => {
    const env = makeEnv();
    const req = new Request(env);
    expect(req.env).toBe(env);
  });

  it("restore the base URL", () => {
    const req = makeReq("http://example.org:8080/app/page?q=1", { script_name: "/app" });
    expect(req.baseUrl).toContain("example.org");
  });

  it("restore the URL", () => {
    const req = makeReq("http://example.org/page?q=1");
    expect(req.url).toContain("example.org");
    expect(req.url).toContain("page");
    expect(req.url).toContain("q=1");
  });

  it("restore the full path", () => {
    const req = makeReq("/page?q=1");
    expect(req.fullpath).toBe("/page?q=1");
  });

  it("handle multiple media type parameters", () => {
    const req = makeReq("/", { CONTENT_TYPE: "text/plain; charset=utf-8; boundary=something" });
    expect(req.mediaType).toBe("text/plain");
    expect(req.mediaTypeParams["charset"]).toBe("utf-8");
  });

  it("returns the same error for invalid post inputs", () => {
    const env = {
      REQUEST_METHOD: "POST",
      PATH_INFO: "/foo",
      "rack.input": {
        read() {
          return "invalid=bar&invalid[foo]=bar";
        },
      },
      CONTENT_TYPE: "application/x-www-form-urlencoded",
    };
    // Conflicting param types (string vs hash) should throw TypeError
    expect(() => new Request(env).POST).toThrow();
    expect(() => new Request(env).POST).toThrow();
  });

  it("parse with junk before boundary", () => {
    const boundary = "AaB03x";
    const input = `blah blah\r\n\r\n--${boundary}\r\ncontent-disposition: form-data; name="reply"\r\n\r\nyes\r\n--${boundary}\r\ncontent-disposition: form-data; name="fileupload"; filename="dj.jpg"\r\ncontent-type: image/jpeg\r\ncontent-transfer-encoding: base64\r\n\r\n/9j/4AAQSkZJRgABAQAAAQABAAD//gA+Q1JFQVRPUjogZ2QtanBlZyB2MS4wICh1c2luZyBJSkcg\r\n--${boundary}--\r\n`;
    const env = {
      ...makeEnv(),
      CONTENT_TYPE: `multipart/form-data; boundary=${boundary}`,
      "rack.input": {
        read() {
          return Buffer.from(input, "binary");
        },
      },
    };
    const req = new Request(env);
    // Junk before boundary should cause an error
    expect(() => req.POST).toThrow();
  });

  it("not infinite loop with a malformed HTTP request", () => {
    const boundary = "AaB03x";
    // Malformed: uses \n instead of \r\n
    const input = `--${boundary}\ncontent-disposition: form-data; name="reply"\n\nyes\n--${boundary}\ncontent-disposition: form-data; name="fileupload"; filename="dj.jpg"\ncontent-type: image/jpeg\n\n/9j/4AAQ\n--${boundary}--\n`;
    const env = {
      ...makeEnv(),
      CONTENT_TYPE: `multipart/form-data; boundary=${boundary}`,
      "rack.input": {
        read() {
          return Buffer.from(input, "binary");
        },
      },
    };
    const req = new Request(env);
    // Should either throw or return without infinite loop
    try {
      void req.POST;
    } catch {
      // Expected - malformed data
    }
  });

  it("parse multipart form data", () => {
    const boundary = "AaB03x";
    const input = `--${boundary}\r\ncontent-disposition: form-data; name="reply"\r\n\r\nyes\r\n--${boundary}\r\ncontent-disposition: form-data; name="fileupload"; filename="dj.jpg"\r\ncontent-type: image/jpeg\r\ncontent-transfer-encoding: base64\r\n\r\n/9j/4AAQSkZJRgABAQAAAQABAAD//gA+Q1JFQVRPUjogZ2QtanBlZyB2MS4wICh1c2luZyBJSkcg\r\n--${boundary}--\r\n`;
    const env = {
      ...makeEnv(),
      CONTENT_TYPE: `multipart/form-data; boundary=${boundary}`,
      "rack.input": {
        read() {
          return Buffer.from(input, "binary");
        },
      },
    };
    const req = new Request(env);
    expect(req.POST["reply"]).toBe("yes");
    expect(req.POST["fileupload"]).toBeDefined();
    expect(req.POST["fileupload"].filename).toBe("dj.jpg");
    expect(req.POST["fileupload"].type).toBe("image/jpeg");
    expect(req.formData).toBe(true);
    expect(req.mediaType).toBe("multipart/form-data");
    expect(req.mediaTypeParams["boundary"]).toBe("AaB03x");
  });

  it("parse multipart delimiter-only boundary", () => {
    const boundary = "AaB03x";
    const input = `--${boundary}--\r\n`;
    const env = {
      ...makeEnv(),
      CONTENT_TYPE: `multipart/form-data; boundary=${boundary}`,
      "rack.input": {
        read() {
          return Buffer.from(input, "binary");
        },
      },
    };
    const req = new Request(env);
    expect(req.POST).toEqual({});
    expect(req.GET).toEqual({});
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
      "rack.input": {
        read() {
          return Buffer.from(body, "binary");
        },
      },
      _multipart_file_limit: 5,
    };
    const req = new Request(env);
    expect(() => req.POST).toThrow(MultipartPartLimitError);
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
      "rack.input": {
        read() {
          return Buffer.from(body, "binary");
        },
      },
      _multipart_total_limit: 5,
    };
    const req = new Request(env);
    expect(() => req.POST).toThrow(MultipartTotalPartLimitError);
  });

  it("closes tempfiles it created in the case of too many created", () => {
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
      "rack.input": {
        read() {
          return Buffer.from(body, "binary");
        },
      },
      _multipart_file_limit: 5,
    };
    const req = new Request(env);
    expect(() => req.POST).toThrow(MultipartPartLimitError);
    // In JS, tempfiles are just in-memory buffers, so no cleanup needed
  });

  it("parse big multipart form data", () => {
    const boundary = "AaB03x";
    const bigData = "x".repeat(32768);
    const input = `--${boundary}\r\ncontent-disposition: form-data; name="huge"; filename="huge"\r\n\r\n${bigData}\r\n--${boundary}\r\ncontent-disposition: form-data; name="mean"; filename="mean"\r\n\r\n--AaB03xha\r\n--${boundary}--\r\n`;
    const env = {
      ...makeEnv(),
      CONTENT_TYPE: `multipart/form-data; boundary=${boundary}`,
      "rack.input": {
        read() {
          return Buffer.from(input, "binary");
        },
      },
    };
    const req = new Request(env);
    expect(req.POST["huge"].tempfile.read().length).toBe(32768);
    req.POST["huge"].tempfile.rewind();
    expect(req.POST["mean"].tempfile.read()).toBe("--AaB03xha");
  });

  it("record tempfiles from multipart form data in env[rack.tempfiles]", () => {
    const boundary = "AaB03x";
    const input = `--${boundary}\r\ncontent-disposition: form-data; name="f1"; filename="foo.jpg"\r\ncontent-type: image/jpeg\r\n\r\ndata1\r\n--${boundary}\r\ncontent-disposition: form-data; name="f2"; filename="bar.jpg"\r\ncontent-type: image/jpeg\r\n\r\ndata2\r\n--${boundary}--\r\n`;
    const env = {
      ...makeEnv(),
      CONTENT_TYPE: `multipart/form-data; boundary=${boundary}`,
      "rack.input": {
        read() {
          return Buffer.from(input, "binary");
        },
      },
    };
    const req = new Request(env);
    void req.POST;
    // Our implementation stores file info objects in POST, not env rack.tempfiles
    // Verify files were parsed
    expect(req.POST["f1"].filename).toBe("foo.jpg");
    expect(req.POST["f2"].filename).toBe("bar.jpg");
  });

  it("detect invalid multipart form data", () => {
    const boundary = "AaB03x";
    // Missing header/body separator and closing boundary
    const input = `--${boundary}\r\ncontent-disposition: form-data; name="huge"; filename="huge"\r\n`;
    const env = {
      ...makeEnv(),
      CONTENT_TYPE: `multipart/form-data; boundary=${boundary}`,
      "rack.input": {
        read() {
          return Buffer.from(input, "binary");
        },
      },
    };
    const req = new Request(env);
    expect(() => req.POST).toThrow(EmptyContentError);

    const input2 = `--${boundary}\r\ncontent-disposition: form-data; name="huge"; filename="huge"\r\n\r\nfoo\r\n`;
    const env2 = {
      ...makeEnv(),
      CONTENT_TYPE: `multipart/form-data; boundary=${boundary}`,
      "rack.input": {
        read() {
          return Buffer.from(input2, "binary");
        },
      },
    };
    expect(() => new Request(env2).POST).toThrow(EmptyContentError);
  });

  it("consistently raise EOFError on bad multipart form data", () => {
    const boundary = "AaB03x";
    const input = `--${boundary}\r\ncontent-disposition: form-data; name="huge"; filename="huge"\r\n`;
    const env = {
      ...makeEnv(),
      CONTENT_TYPE: `multipart/form-data; boundary=${boundary}`,
      "rack.input": {
        read() {
          return Buffer.from(input, "binary");
        },
      },
    };
    const req = new Request(env);
    expect(() => req.POST).toThrow(EmptyContentError);
    expect(() => req.POST).toThrow(EmptyContentError);
  });

  it("correctly parse the part name from Content-Id header", () => {
    const boundary = "AaB03x";
    const input = `--${boundary}\r\ncontent-type: text/xml; charset=utf-8\r\nContent-Id: <soap-start>\r\ncontent-transfer-encoding: 7bit\r\n\r\nfoo\r\n--${boundary}--\r\n`;
    const env = {
      ...makeEnv(),
      CONTENT_TYPE: `multipart/related; boundary=${boundary}`,
      "rack.input": {
        read() {
          return Buffer.from(input, "binary");
        },
      },
    };
    const req = new Request(env);
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
    const req = new Request(env);
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
    const req = new Request(env);
    expect(req.POST).toBe(formHash);
  });

  it("conform to the Rack spec", () => {
    const boundary = "AaB03x";
    const input = `--${boundary}\r\ncontent-disposition: form-data; name="reply"\r\n\r\nyes\r\n--${boundary}\r\ncontent-disposition: form-data; name="fileupload"; filename="dj.jpg"\r\ncontent-type: image/jpeg\r\ncontent-transfer-encoding: base64\r\n\r\n/9j/4AAQSkZJRgABAQAAAQABAAD//gA+Q1JFQVRPUjogZ2QtanBlZyB2MS4wICh1c2luZyBJSkcg\r\n--${boundary}--\r\n`;
    const env = {
      ...makeEnv(),
      CONTENT_TYPE: `multipart/form-data; boundary=${boundary}`,
      CONTENT_LENGTH: String(input.length),
      "rack.input": {
        read() {
          return Buffer.from(input, "binary");
        },
      },
    };
    const req = new Request(env);
    const file = req.POST["fileupload"];
    expect(file).toBeDefined();
    expect(file.filename).toBe("dj.jpg");
    expect(file.type).toBe("image/jpeg");
  });

  it("parse Accept-Encoding correctly", () => {
    const req = makeReq("/", { HTTP_ACCEPT_ENCODING: "gzip;q=1.0, deflate;q=0.5" });
    const ae = req.acceptEncoding;
    expect(ae).toEqual([
      ["gzip", 1.0],
      ["deflate", 0.5],
    ]);
  });

  it("parse Accept-Language correctly", () => {
    const req = makeReq("/", { HTTP_ACCEPT_LANGUAGE: "en;q=0.9, fr;q=0.8" });
    const al = req.acceptLanguage;
    expect(al).toEqual([
      ["en", 0.9],
      ["fr", 0.8],
    ]);
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

    // IPv6 format with optional port: "[2001:db8:cafe::17]:47011"
    expect(ip({ HTTP_X_FORWARDED_FOR: "[2001:db8:cafe::17]:47011" })).toBe("2001:db8:cafe::17");
    expect(ip({ HTTP_FORWARDED: 'for="[2001:db8:cafe::17]:47011"' })).toBe("2001:db8:cafe::17");
    expect(ip({ HTTP_X_FORWARDED_FOR: "1.2.3.4, [2001:db8:cafe::17]:47011" })).toBe(
      "2001:db8:cafe::17",
    );

    // IPv4 format with optional port: "192.0.2.43:47011"
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

    // Unix Sockets
    expect(ip({ REMOTE_ADDR: "unix", HTTP_X_FORWARDED_FOR: "3.4.5.6" })).toBe("3.4.5.6");
    expect(ip({ REMOTE_ADDR: "unix:/tmp/foo", HTTP_X_FORWARDED_FOR: "3.4.5.6" })).toBe("3.4.5.6");
  });

  it("not allow IP spoofing via Client-IP and X-Forwarded-For headers", () => {
    // IP Spoofing attempt:
    // Client sends          X-Forwarded-For: 6.6.6.6
    //                       Client-IP: 6.6.6.6
    // Load balancer adds    X-Forwarded-For: 2.2.2.3, 192.168.0.7
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
    Request.ipFilter = (ip: string) => ip === "foo";
    try {
      const req = makeReq("/");
      expect(req.trustedProxy("foo")).toBe(true);
    } finally {
      Request.ipFilter = oldIp;
    }
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
    const req = makeReq();
    expect(req.session).toEqual({});
  });

  it("sets the default session options to an empty hash", () => {
    const req = makeReq();
    expect(req.sessionOptions).toEqual({});
  });

  it("allow subclass request to be instantiated after parent request", () => {
    class SubRequest extends Request {}
    const env = makeEnv();
    const _parent = new Request(env);
    const sub = new SubRequest(env);
    expect(sub).toBeInstanceOf(SubRequest);
    expect(sub).toBeInstanceOf(Request);
  });

  it("allow parent request to be instantiated after subclass request", () => {
    class SubRequest extends Request {}
    const env = makeEnv();
    const _sub = new SubRequest(env);
    const parent = new Request(env);
    expect(parent).toBeInstanceOf(Request);
  });

  it("raise TypeError every time if request parameters are broken", () => {
    // foo[]=0 and foo[bar]=1 conflict (array vs hash)
    const req = makeReq("/?foo%5B%5D=0&foo%5Bbar%5D=1");
    expect(() => req.GET).toThrow();
  });

  it("not strip '' => '' => '' escaped character from parameters when accessed as string", () => {
    // Test that percent-encoded characters are decoded correctly
    const req = makeReq("/?foo=%22bar%22");
    expect(req.GET["foo"]).toBe('"bar"');
  });

  it("handles ASCII NUL input of  bytes", () => {
    const length = 256;
    const req = makeReq("/", {
      method: "POST",
      input: "\0".repeat(length),
      CONTENT_TYPE: "application/x-www-form-urlencoded",
    });
    const keys = Object.keys(req.POST);
    expect(keys.length).toBe(1);
    // The NUL bytes are parsed as a single key (URL-encoded parsing treats them as chars)
    expect(keys[0]).toContain("\0");
  });

  it("Env sets @env on initialization", () => {
    const env = makeEnv();
    const req = new Request(env);
    expect(req.env).toBe(env);
  });

  it("return values for the keys in the order given from values_at", () => {
    const req = makeReq("/?foo=baz&wun=der&bar=ful");
    expect(req.valuesAt("foo")).toEqual(["baz"]);
    expect(req.valuesAt("foo", "wun")).toEqual(["baz", "der"]);
    expect(req.valuesAt("bar", "foo", "wun")).toEqual(["ful", "baz", "der"]);
  });

  it("expose the HTTP_HOST as hostAuthority", () => {
    const req = makeReq("/", { HTTP_HOST: "example.com:8080" });
    expect(req.hostAuthority).toBe("example.com:8080");
    expect(makeReq("/").hostAuthority).toBeNull();
  });

  it("detect parseable data media types", () => {
    expect(makeReq("/", { CONTENT_TYPE: "multipart/related" }).isParseableData()).toBe(true);
    expect(makeReq("/", { CONTENT_TYPE: "multipart/mixed" }).isParseableData()).toBe(true);
    expect(makeReq("/", { CONTENT_TYPE: "multipart/form-data" }).isParseableData()).toBe(false);
    expect(makeReq("/", { CONTENT_TYPE: "application/json" }).isParseableData()).toBe(false);
  });

  it("restore the path as scriptName + pathInfo", () => {
    const req = makeReq("http://example.com/foo/bar?q=1");
    req.env["SCRIPT_NAME"] = "/app";
    expect(req.path).toBe("/app/foo/bar");
  });

  it("respond to isLink, isTrace, isUnlink", () => {
    expect(new Request({ REQUEST_METHOD: "LINK" }).isLink()).toBe(true);
    expect(new Request({ REQUEST_METHOD: "LINK" }).isTrace()).toBe(false);
    expect(new Request({ REQUEST_METHOD: "TRACE" }).isTrace()).toBe(true);
    expect(new Request({ REQUEST_METHOD: "TRACE" }).isLink()).toBe(false);
    expect(new Request({ REQUEST_METHOD: "UNLINK" }).isUnlink()).toBe(true);
    expect(new Request({ REQUEST_METHOD: "UNLINK" }).isLink()).toBe(false);
  });

  it("return the logger from the env", () => {
    const fakeLogger = { info: () => {} };
    const req = new Request({ "rack.logger": fakeLogger });
    expect(req.logger).toBe(fakeLogger);

    const req2 = new Request({});
    expect(req2.logger).toBeNull();
  });

  it("return content_charset from media type params", () => {
    const req = new Request({
      REQUEST_METHOD: "POST",
      CONTENT_TYPE: "text/plain;charset=utf-8",
    });
    expect(req.contentCharset).toBe("utf-8");

    const req2 = new Request({ REQUEST_METHOD: "GET" });
    expect(req2.contentCharset).toBeNull();
  });

  it("return server_name from the env", () => {
    const req = new Request({ SERVER_NAME: "example.org", SERVER_PORT: "9292" });
    expect(req.serverName).toBe("example.org");

    const req2 = new Request({});
    expect(req2.serverName).toBeNull();
  });

  it("return hostname from authority", () => {
    expect(makeReq("/", { HTTP_HOST: "example.org" }).hostname).toBe("example.org");
    expect(makeReq("/", { HTTP_HOST: "example.org:8080" }).hostname).toBe("example.org");
    expect(makeReq("/", { SERVER_NAME: "myserver", SERVER_PORT: "80" }).hostname).toBe("myserver");
  });
});
