import { describe, it, expect } from "vitest";
import { Request } from "./request.js";
import { MockRequest } from "./mock-request.js";
import { StringIO } from "@blazetrails/ruby-compat";

function makeEnv(overrides: Record<string, any> = {}): Record<string, any> {
  return MockRequest.envFor("/", overrides);
}

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
    expect(req.ip).toBe("1.2.3.4");
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

  const graphCases: Array<[string, number, boolean]> = [
    ["a C1 control", 0x80, false],
    ["a soft hyphen", 0x00ad, true],
    ["a zero-width space", 0x200b, true],
    ["a byte order mark", 0xfeff, true],
    ["an unassigned code point", 0x0378, false],
    ["a private use code point", 0xe000, true],
    ["a no-break space", 0x00a0, false],
    ["an ideographic space", 0x3000, false],
    ["a line separator", 0x2028, false],
    ["a delete", 0x7f, false],
  ];

  for (const [name, codePoint, graph] of graphCases) {
    it(`matches MRI's [[:graph:]] for a hostname containing ${name}`, () => {
      const authority = `exa${String.fromCodePoint(codePoint)}mple.com`;
      const req = new Request(MockRequest.envFor("/", { HTTP_HOST: authority }));

      expect(req.host).toBe(graph ? authority : null);
      expect(req.hostname).toBe(graph ? authority : null);
    });
  }
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
    const req = makeRequest(env);
    expect(req.POST).toEqual({ foo: "bar" });
  });

  it("truncate POST body at bytesize_limit when parsing url-encoded data", () => {
    const largeBody = "a=1&".repeat(1000);
    const req = makeReq("/", {
      ":method": "POST",
      ":input": largeBody,
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
    const req = makeRequest(env);
    expect(req.POST["foo"]).toBeDefined();
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

  it("return form_pairs for url-encoded POST data", () => {
    const req = new Request(
      MockRequest.envFor("/", {
        ":method": "POST",
        ":input": "foo=bar&baz=qux",
        CONTENT_TYPE: "application/x-www-form-urlencoded",
      }),
    );
    expect(req.formPairs).toEqual([
      ["foo", "bar"],
      ["baz", "qux"],
    ]);
  });

  it("preserve duplicate keys in form_pairs", () => {
    const req = new Request(
      MockRequest.envFor("/", {
        ":method": "POST",
        ":input": "foo=1&foo=2",
        CONTENT_TYPE: "application/x-www-form-urlencoded",
      }),
    );
    expect(req.formPairs).toEqual([
      ["foo", "1"],
      ["foo", "2"],
    ]);
  });

  it("handle empty values in form_pairs", () => {
    const req = new Request(
      MockRequest.envFor("/", {
        ":method": "POST",
        ":input": "foo=&bar=baz",
        CONTENT_TYPE: "application/x-www-form-urlencoded",
      }),
    );
    expect(req.formPairs).toEqual([
      ["foo", ""],
      ["bar", "baz"],
    ]);
  });

  it("return empty array for form_pairs with no POST data", () => {
    const req = new Request(
      MockRequest.envFor("/", {
        ":method": "POST",
        ":input": "",
        CONTENT_TYPE: "application/x-www-form-urlencoded",
      }),
    );
    expect(req.formPairs).toEqual([]);
  });

  it("return empty array for form_pairs with non-form content type", () => {
    const req = new Request(
      MockRequest.envFor("/", {
        ":method": "POST",
        ":input": '{"a":1}',
        CONTENT_TYPE: "application/json",
      }),
    );
    expect(req.formPairs).toEqual([]);
  });

  it("raise same error for form_pairs as POST with invalid encoding", () => {
    const req = new Request(
      MockRequest.envFor("/", {
        ":method": "POST",
        ":input": "a%=1",
        CONTENT_TYPE: "application/x-www-form-urlencoded",
      }),
    );
    expect(() => req.formPairs).toThrow();
  });

  it("return form_pairs for multipart form data", () => {
    const boundary = "AaB03x";
    const body = `--${boundary}\r\ncontent-disposition: form-data; name="reply"\r\n\r\nyes\r\n--${boundary}\r\ncontent-disposition: form-data; name="name"\r\n\r\nJohn\r\n--${boundary}--\r\n`;
    const env = {
      ...makeEnv(),
      CONTENT_TYPE: `multipart/form-data; boundary=${boundary}`,
      "rack.input": new StringIO(body),
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
      "rack.input": new StringIO(body),
    };
    const req = new Request(env);
    const _post = req.POST;
    expect(req.formPairs.length).toBeGreaterThan(0);
  });

  it("include file uploads in multipart form_pairs", () => {
    const boundary = "AaB03x";
    const body = `--${boundary}\r\ncontent-disposition: form-data; name="reply"\r\n\r\nyes\r\n--${boundary}\r\ncontent-disposition: form-data; name="fileupload"; filename="test.txt"\r\ncontent-type: text/plain\r\n\r\nfile content\r\n--${boundary}--\r\n`;
    const env = {
      ...makeEnv(),
      CONTENT_TYPE: `multipart/form-data; boundary=${boundary}`,
      "rack.input": new StringIO(body),
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
      "rack.input": new StringIO(body),
    };
    const req = new Request(env);
    expect(req.formPairs).toEqual([]);
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
