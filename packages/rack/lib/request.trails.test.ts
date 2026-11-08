import { describe, it, expect } from "vitest";
import { Request } from "./request.js";
import { MockRequest } from "./mock-request.js";

function makeRequest(env: Record<string, any>): Request {
  return new Request(env);
}

function makeReq(uri = "/", overrides: Record<string, any> = {}): Request {
  return makeRequest(MockRequest.envFor(uri, overrides));
}

describe("RackRequestTrailsTest", () => {
  it("compacts a forwarded authority that does not match AUTHORITY out of forwardedPort", () => {
    const req = new Request(
      MockRequest.envFor("/", { HTTP_FORWARDED: "for=1.2.3.4:1234, for=]bad[" }),
    );

    expect(req.forwardedPort).toEqual([1234]);
  });

  it("treats a non-matching authority as nil against a scheme with no default port", () => {
    const req = new Request(
      MockRequest.envFor("/", { HTTP_HOST: "]bad[", "rack.url_scheme": "ftp" }),
    );

    expect(req.hostWithPort()).toBeNull();
  });

  it("keeps a forwarded authority that does not match AUTHORITY as nil in forwardedFor", () => {
    const req = new Request(MockRequest.envFor("/", { HTTP_FORWARDED: "for=1.2.3.4, for=]bad[" }));

    expect(req.forwardedFor).toEqual(["1.2.3.4", undefined]);
    expect(req.ip).toBeNull();
  });

  it("answers nil for ip when every forwarded authority misses AUTHORITY", () => {
    const req = new Request(
      MockRequest.envFor("/", { HTTP_FORWARDED: "for=]bad[", REMOTE_ADDR: "127.0.0.1" }),
    );

    expect(req.forwardedFor).toEqual([undefined]);
    expect(req.ip).toBeNull();
  });

  it("keeps a nil element from x-forwarded-for and returns the trailing client address", () => {
    const req = new Request(
      MockRequest.envFor("/", {
        HTTP_X_FORWARDED_FOR: "]bad[, 1.2.3.4",
        REMOTE_ADDR: "127.0.0.1",
      }),
    );

    expect(req.forwardedFor).toEqual([undefined, "1.2.3.4"]);
    expect(req.ip).toBe("1.2.3.4");
  });
});

describe("Rack::Request.ip_filter", () => {
  it("is the filter trusted_proxy? calls", () => {
    const old = Request.ipFilter;
    try {
      Request.ipFilter = (ip) => ip === "1.2.3.4";
      expect(new Request({}).trustedProxy("1.2.3.4")).toBe(true);
      expect(new Request({}).trustedProxy("127.0.0.1")).toBe(false);
    } finally {
      Request.ipFilter = old;
    }
    expect(new Request({}).trustedProxy("127.0.0.1")).toBe(true);
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
    expect(makeRequest({ REQUEST_METHOD: "LINK" }).isLink()).toBe(true);
    expect(makeRequest({ REQUEST_METHOD: "LINK" }).isTrace()).toBe(false);
    expect(makeRequest({ REQUEST_METHOD: "TRACE" }).isTrace()).toBe(true);
    expect(makeRequest({ REQUEST_METHOD: "TRACE" }).isLink()).toBe(false);
    expect(makeRequest({ REQUEST_METHOD: "UNLINK" }).isUnlink()).toBe(true);
    expect(makeRequest({ REQUEST_METHOD: "UNLINK" }).isLink()).toBe(false);
  });

  it("return the logger from the env", () => {
    const fakeLogger = { info: () => {} };
    const req = makeRequest({ "rack.logger": fakeLogger });
    expect(req.logger).toBe(fakeLogger);

    const req2 = makeRequest({});
    expect(req2.logger).toBeNull();
  });

  it("return content_charset from media type params", () => {
    const req = makeRequest({
      REQUEST_METHOD: "POST",
      CONTENT_TYPE: "text/plain;charset=utf-8",
    });
    expect(req.contentCharset).toBe("utf-8");

    const req2 = makeRequest({ REQUEST_METHOD: "GET" });
    expect(req2.contentCharset).toBeNull();
  });

  it("return server_name from the env", () => {
    const req = makeRequest({ SERVER_NAME: "example.org", SERVER_PORT: "9292" });
    expect(req.serverName).toBe("example.org");

    const req2 = makeRequest({});
    expect(req2.serverName).toBeNull();
  });

  it("return hostname from authority", () => {
    expect(makeReq("/", { HTTP_HOST: "example.org" }).hostname).toBe("example.org");
    expect(makeReq("/", { HTTP_HOST: "example.org:8080" }).hostname).toBe("example.org");
    expect(makeReq("/", { SERVER_NAME: "myserver", SERVER_PORT: "80" }).hostname).toBe("myserver");
  });
});

describe("Rack::Request#POST over a binary form body", () => {
  it("decodes raw UTF-8 bytes in the body as text", () => {
    const req = new Request(
      MockRequest.envFor("/", {
        ":method": "POST",
        CONTENT_TYPE: "application/x-www-form-urlencoded",
        ":input": new TextEncoder().encode("a=é&b=%C3%A9"),
      }),
    );
    expect(req.POST).toEqual({ a: "é", b: "é" });
  });
});
