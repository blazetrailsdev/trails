import { beforeEach, describe, it, expect } from "vitest";
import { Request } from "../http/request.js";
import { Response } from "../http/response.js";
import { IOError } from "@blazetrails/ruby-compat";
import {
  assert,
  assertEqual,
  assertNil,
  assertNot,
  assertEmpty,
  assertNotRespondTo,
  assertRaises,
} from "@blazetrails/activesupport";
import { flatten } from "@blazetrails/ruby-compat";
import {
  bodyFromString,
  ContentLength,
  MockRequest,
  type RackBody as RackBodyType,
  type RackEnv,
  type RackResponse,
} from "@blazetrails/rack";
import { RackBody } from "../http/response.js";
import { Mime } from "../http/mime-type.js";
import { IntegrationTest } from "../testing/integration.js";
import { HeadersAssertions } from "../../test-helpers/abstract-unit.js";

const self = { ...HeadersAssertions, response: { headers: {} } };

function newResponse(): Response {
  const response = Response.create();
  response.request = Request.empty();
  return response;
}

describe("ResponseTest", () => {
  it("simple output", () => {
    const response = newResponse();
    response.body = "Hello, World!";

    const [status, headers, body] = response.toA();
    assertEqual(200, status);

    self.assertHeaders({ "content-type": "text/html; charset=utf-8" }, headers);

    const parts: unknown[] = [];
    (body as RackBody).each((part: unknown) => parts.push(part));
    assertEqual(["Hello, World!"], parts);
  });

  it("status handled properly in initialize", () => {
    assertEqual(200, new Response("200 OK").status);
  });

  it("response code", () => {
    const response = newResponse();
    response.status = "200 OK";
    assertEqual(200, response.responseCode);

    response.status = "200";
    assertEqual(200, response.responseCode);

    response.status = 200;
    assertEqual(200, response.responseCode);
  });

  it("message", () => {
    expect(new Response(200).message).toBe("OK");
    expect(new Response(404).message).toBe("Not Found");
    expect(new Response(500).message).toBe("Internal Server Error");
    expect(new Response(301).message).toBe("Moved Permanently");
  });

  it("only set charset still defaults to text html", () => {
    const response = new Response();
    response.charset = "utf-16";
    const [, headers] = response.toA();
    assertEqual("text/html; charset=utf-16", headers["content-type"]);
  });

  it("utf8 output", () => {
    const response = newResponse();
    response.body = String.fromCodePoint(1090, 1077, 1089, 1090);

    const [status, headers] = response.toA();
    assertEqual(200, status);
    self.assertHeaders({ "content-type": "text/html; charset=utf-8" }, headers);
  });

  it("content length", () => {
    for (const c of [100, 101, 102, 103, 204]) {
      const response = new Response();
      response.status = String(c);
      response.setHeader("Content-Length", "0");
      const [, headers] = response.toA();
      assertNot(
        Object.hasOwn(headers, "Content-Length"),
        `${c} must not have a Content-Length header field`,
      );
    }
  });

  it("does not contain a message-body", () => {
    for (const c of [100, 101, 102, 103, 204, 304]) {
      const response = new Response();
      response.status = String(c);
      response.body = "Body must not be included";
      const [, , body] = response.toA();
      assertEmpty(body, `${c} must not have a message-body but actually contains ${body}`);
    }
  });

  it("content type", () => {
    for (const c of [204, 304]) {
      const response = new Response();
      response.status = String(c);
      const [, headers] = response.toA();
      assertNot(Object.hasOwn(headers, "content-type"), `${c} should not have Content-Type header`);
    }

    for (const c of [200, 302, 404, 500]) {
      const response = new Response();
      response.status = String(c);
      const [, headers] = response.toA();
      assert(Object.hasOwn(headers, "content-type"), `${c} did not have Content-Type header`);
    }
  });

  it("empty content type returns nil", () => {
    const res = new Response();
    expect(res.contentType).toBeNull();
  });

  it("setting content type header impacts content type method", () => {
    const response = newResponse();
    response.headers.set("Content-Type", "application/aaron");
    assertEqual("application/aaron", response.contentType);
  });

  it("response charset writer", () => {
    const response = newResponse();
    response.charset = "utf-16";
    assertEqual("utf-16", response.charset);
    response.charset = null;
    assertEqual("utf-8", response.charset);
  });

  it("cookies", () => {
    const res = new Response();
    res.setCookie("user_name", { value: "david", path: "/" });
    expect(res.headers.get("set-cookie")).toBe("user_name=david; path=/");
    expect(res.cookies).toEqual({ user_name: "david" });
  });

  it("multiple cookies", () => {
    const res = new Response();
    res.setCookie("user_name", { value: "david", path: "/" });
    res.setCookie("login", {
      value: "foo&bar",
      path: "/",
      expires: new Date(Date.UTC(2005, 9, 10, 5)),
    });
    expect(res.headers.get("set-cookie")).toBe(
      "user_name=david; path=/\nlogin=foo%26bar; path=/; expires=Mon, 10 Oct 2005 05:00:00 GMT",
    );
    expect(res.cookies).toEqual({ login: "foo&bar", user_name: "david" });
  });

  it("delete cookies", () => {
    const res = new Response();
    res.setCookie("user_name", { value: "david", path: "/" });
    res.setCookie("login", {
      value: "foo&bar",
      path: "/",
      expires: new Date(Date.UTC(2005, 9, 10, 5)),
    });
    res.deleteCookie("login");
    expect(res.cookies).toStrictEqual({ user_name: "david", login: null });
  });

  it("read ETag and Cache-Control", () => {
    const res = new Response();
    res.weakEtag("abc123");
    res._cacheControl = "public, max-age=3600";
    expect(res.etag?.startsWith('W/"')).toBe(true);
    expect(res._cacheControl).toBe("public, max-age=3600");
  });

  it("read strong ETag", () => {
    const res = new Response();
    res.strongEtag("strong-etag");
    expect(res.isStrongEtag()).toBe(true);
    expect(res.isWeakEtag()).toBe(false);
  });

  it("read charset and content type", () => {
    const resp = new Response();
    resp.charset = "utf-16";
    resp.contentType = Mime.get(":xml")!;
    resp.body = "Hello";
    resp.toA();

    assertEqual("utf-16", resp.charset);
    assertEqual(Mime.get(":xml")!.toString(), resp.mediaType);
    assertEqual("application/xml; charset=utf-16", resp.contentType);
    assertEqual("application/xml; charset=utf-16", resp.headers.get("Content-Type"));
  });

  it("respect no-store cache-control", () => {
    const res = new Response();
    res._cacheControl = "no-store";
    expect(res._cacheControl).toBe("no-store");
  });

  it("respect private, no-store cache-control", () => {
    const res = new Response();
    res._cacheControl = "private, no-store";
    expect(res._cacheControl).toBe("private, no-store");
  });

  it("does not include Status header", () => {
    const response = newResponse();
    response.status = "200 OK";
    const [, headers] = response.toA();
    assertNot(Object.hasOwn(headers, "status"));
  });

  it("can wait until commit", () => {
    const res = new Response();
    expect(res.committed).toBe(false);
    res.close();
    expect(res.committed).toBe(true);
  });

  it("stream close", () => {
    const res = new Response();
    res.close();
    expect(res.committed).toBe(true);
  });

  it("stream write", () => {
    const response = newResponse();
    const stream = response.stream as { write(s: string): void; close(): void };
    stream.write("foo");
    stream.close();
    assertEqual("foo", response.body);
  });

  it("write after close", async () => {
    const res = new Response();
    res.close();

    const e = await assertRaises([IOError], {}, () => {
      res.write("more");
    });
    expect(e.message).toBe("closed stream");
  });

  it("each isnt called if str body is written", () => {
    const res = new Response();
    res.body = "direct body";
    expect(res.body).toBe("direct body");
  });

  it("response body encoding", () => {
    const body = ["hello"];
    const response = new Response(200, {}, body);
    response.request = Request.empty();
    assertEqual("hello", response.body);
  });

  it("set header after read body during action", () => {
    const response = newResponse();
    void response.body;

    response.setHeader("x-header", "Best of all possible worlds.");

    const [status, headers, body] = response.toA();
    assertEqual(200, status);
    assertEqual("", (body as RackBody).body);

    assertEqual("Best of all possible worlds.", headers["x-header"]);
  });

  it("read body during action", () => {
    const response = newResponse();
    response.body = "Hello, World!";

    assertNil(response.contentType);

    assertEqual("Hello, World!", response.body);

    const [status, headers, body] = response.toA();
    assertEqual(200, status);
    self.assertHeaders({ "content-type": "text/html; charset=utf-8" }, headers);

    const parts: unknown[] = [];
    (body as RackBody).each((part: unknown) => parts.push(part));
    assertEqual(["Hello, World!"], parts);
  });

  it("code", () => {
    const response = newResponse();
    response.status = "200 OK";
    assertEqual("200", response.code);

    response.status = "200";
    assertEqual("200", response.code);

    response.status = 200;
    assertEqual("200", response.code);
  });

  it("read content type with default charset utf-8", () => {
    const res = new Response(200, { "Content-Type": "text/xml" });
    expect(res.charset).toBe("utf-8");
  });

  it("read content type with charset utf-16", () => {
    const original = Response.defaultCharset;
    try {
      Response.defaultCharset = "utf-16";
      const res = new Response(200, { "Content-Type": "text/xml" });
      expect(res.charset).toBe("utf-16");
    } finally {
      Response.defaultCharset = original;
    }
  });

  it("read x_frame_options, x_content_type_options, x_xss_protection, x_permitted_cross_domain_policies and referrer_policy", () => {
    const original = Response.defaultHeaders;
    try {
      Response.defaultHeaders = {
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
        "X-XSS-Protection": "0",
        "X-Permitted-Cross-Domain-Policies": "none",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      };
      const resp = Response.create();
      resp.body = "Hello";
      resp.toA();
      expect(resp.headers.get("X-Frame-Options")).toBe("DENY");
      expect(resp.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(resp.headers.get("X-XSS-Protection")).toBe("0");
      expect(resp.headers.get("X-Permitted-Cross-Domain-Policies")).toBe("none");
      expect(resp.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    } finally {
      Response.defaultHeaders = original;
    }
  });

  it("read custom default_header", () => {
    const original = Response.defaultHeaders;
    try {
      Response.defaultHeaders = {
        "X-XX-XXXX": "Here is my phone number",
      };
      const resp = Response.create();
      resp.body = "Hello";
      resp.toA();
      expect(resp.headers.get("X-XX-XXXX")).toBe("Here is my phone number");
    } finally {
      Response.defaultHeaders = original;
    }
  });

  it("respond_to? accepts include_private", () => {
    assertNotRespondTo(newResponse(), "methodMissing");
  });

  it("can be explicitly destructured into status, headers and an enumerable body", () => {
    const res = new Response(404, { "Content-Type": "text/plain" }, ["Not Found"]);
    const [status, headers, body] = res.toA() as [
      number,
      Record<string, string>,
      Iterable<unknown>,
    ];
    expect(status).toBe(404);
    expect(headers["content-type"]).toBe("text/plain");
    expect([...body]).toEqual(["Not Found"]);
  });

  it("[response.to_a].flatten does not recurse infinitely", () => {
    const response = newResponse();
    const [status, headers, body] = flatten([response.toA()]);
    assertEqual(200, status);
    assertEqual(headers, response.headers.toHash());
    assertNil(body);
  });

  it("compatibility with Rack::ContentLength", async () => {
    const response = newResponse();
    response.body = "Hello";
    const app = (_env: RackEnv) => response.toA() as unknown as RackResponse;
    const env = MockRequest.envFor("/");

    let [, headers] = await app(env);
    self.assertNotHeader("content-length", headers);

    [, headers] = await new ContentLength(app).call(env);
    self.assertHeader("content-length", "5", headers);
  });
});

describe("ResponseHeadersTest", () => {
  it("has_header?", () => {
    const response = Response.create();
    response.setHeader("Foo", "1");
    assert(response.hasHeader("Foo"));
    assert(response.hasHeader("foo"));
  });

  it("get_header", () => {
    const res = Response.create();
    res.setHeader("Foo", "1");
    expect(res.getHeader("Foo")).toBe("1");
    expect(res.getHeader("foo")).toBe("1");
  });

  it("set_header", () => {
    const response = Response.create();
    response.setHeader("Foo", "1");
    assertEqual("2", response.setHeader("Foo", "2"));
    assert(response.hasHeader("Foo"));
    assertEqual("2", response.getHeader("Foo"));

    assertNil(response.setHeader("Foo", null));
    assert(response.hasHeader("Foo"));
    assertNil(response.getHeader("Foo"));
  });

  it("delete_header", () => {
    const response = Response.create();
    response.setHeader("Foo", "1");
    assertEqual("1", response.deleteHeader("Foo"));
    assertNot(response.hasHeader("Foo"));
  });

  it("add_header", () => {
    const response = Response.create();
    response.setHeader("Foo", "1");

    self.assertHeaderValue("1,2", response.addHeader("Foo", "2"));
    self.assertHeaderValue("1,2", response.getHeader("Foo"));

    self.assertHeaderValue("1,2", response.addHeader("Foo", null));
    self.assertHeaderValue("1,2", response.getHeader("Foo"));

    assertNil(response.addHeader("Bar", null));
    assertNot(response.hasHeader("Bar"));
    assertNil(response.getHeader("Bar"));

    self.assertHeaderValue("1", response.addHeader("Bar", "1"));
    assert(response.hasHeader("Bar"));
    self.assertHeaderValue("1", response.getHeader("Bar"));
  });
});

describe("ResponseIntegrationTest", () => {
  let testCase: IntegrationTest;
  beforeEach(({ task }) => {
    testCase = new IntegrationTest(task.name);
  });

  function railsishApp(block: (resp: Response) => void) {
    return () => {
      const resp = new Response();
      block(resp);
      resp.request = Request.empty();
      return resp.toA();
    };
  }

  function rackishApp(
    headers: Record<string, string>,
    body: RackBodyType = bodyFromString("Hello"),
  ) {
    return (): RackResponse => [200, headers, body];
  }

  it("response cache control from railsish app", async () => {
    testCase.app = railsishApp((resp) => {
      resp.cacheControl.public = true;
      resp.etag = "123";
      resp.body = "Hello";
    });

    await testCase.get("/");
    testCase.assertResponse("success");

    assertEqual("public", testCase.response.headers.get("Cache-Control"));
    assertEqual('W/"202cb962ac59075b964b07152d234b70"', testCase.response.headers.get("ETag"));

    assertEqual('W/"202cb962ac59075b964b07152d234b70"', testCase.response.etag);
    assertEqual({ public: true }, testCase.response.cacheControl);
  });

  it("response cache control from rackish app", async () => {
    testCase.app = rackishApp({
      ETag: 'W/"202cb962ac59075b964b07152d234b70"',
      "Cache-Control": "public",
    });

    await testCase.get("/");
    testCase.assertResponse("success");

    assertEqual("public", testCase.response.headers.get("Cache-Control"));
    assertEqual('W/"202cb962ac59075b964b07152d234b70"', testCase.response.headers.get("ETag"));

    assertEqual('W/"202cb962ac59075b964b07152d234b70"', testCase.response.etag);
    assertEqual({ public: true }, testCase.response.cacheControl);
  });

  it("response charset and content type from railsish app", async () => {
    testCase.app = railsishApp((resp) => {
      resp.charset = "utf-16";
      resp.contentType = Mime.get("xml")!;
      resp.body = "Hello";
    });

    await testCase.get("/");
    testCase.assertResponse("success");

    assertEqual("utf-16", testCase.response.charset);
    assertEqual(Mime.get("xml"), testCase.response.mediaType);
    assertEqual("application/xml; charset=utf-16", testCase.response.contentType);
    assertEqual("application/xml; charset=utf-16", testCase.response.headers.get("Content-Type"));
  });

  it("response charset and content type from rackish app", async () => {
    testCase.app = rackishApp({ "Content-Type": "application/xml; charset=utf-16" });

    await testCase.get("/");
    testCase.assertResponse("success");

    assertEqual("utf-16", testCase.response.charset);
    assertEqual(Mime.get("xml"), testCase.response.mediaType);
    assertEqual("application/xml; charset=utf-16", testCase.response.contentType);
    assertEqual("application/xml; charset=utf-16", testCase.response.headers.get("Content-Type"));
  });

  it("strong ETag validator", async () => {
    testCase.app = railsishApp((resp) => {
      resp.strongEtag("123");
      resp.body = "Hello";
    });

    await testCase.get("/");
    testCase.assertResponse("ok");

    assertEqual('"202cb962ac59075b964b07152d234b70"', testCase.response.headers.get("ETag"));
    assertEqual('"202cb962ac59075b964b07152d234b70"', testCase.response.etag);
  });

  it("response Content-Type with optional parameters", async () => {
    testCase.app = rackishApp({ "Content-Type": "text/csv; charset=utf-16; header=present" });

    await testCase.get("/");
    testCase.assertResponse("success");

    assertEqual(
      "text/csv; charset=utf-16; header=present",
      testCase.response.headers.get("Content-Type"),
    );
    assertEqual("text/csv; charset=utf-16; header=present", testCase.response.contentType);
    assertEqual("text/csv", testCase.response.mediaType);
    assertEqual("utf-16", testCase.response.charset);
  });

  it("response Content-Type with optional parameters that set before charset", async () => {
    testCase.app = rackishApp({ "Content-Type": "text/csv; header=present; charset=utf-16" });

    await testCase.get("/");
    testCase.assertResponse("success");

    assertEqual(
      "text/csv; header=present; charset=utf-16",
      testCase.response.headers.get("Content-Type"),
    );
    assertEqual("text/csv; header=present; charset=utf-16", testCase.response.contentType);
    assertEqual("text/csv; header=present", testCase.response.mediaType);
    assertEqual("utf-16", testCase.response.charset);
  });

  it("response Content-Type with quoted-string", async () => {
    testCase.app = rackishApp({ "Content-Type": 'text/csv; header=present; charset="utf-16"' });

    await testCase.get("/");
    testCase.assertResponse("success");

    assertEqual(
      'text/csv; header=present; charset="utf-16"',
      testCase.response.headers.get("Content-Type"),
    );
    assertEqual('text/csv; header=present; charset="utf-16"', testCase.response.contentType);
    assertEqual("text/csv; header=present", testCase.response.mediaType);
    assertEqual("utf-16", testCase.response.charset);
  });

  it("response body with enumerator", async () => {
    testCase.app = rackishApp(
      { "Content-Type": "text/plain" },
      (async function* () {
        for (let n = 0; n < 10; n++) yield String(n);
      })(),
    );
    await testCase.get("/");
    testCase.assertResponse("success");

    assertEqual("text/plain", testCase.response.headers.get("Content-Type"));
    assertEqual("text/plain", testCase.response.contentType);
    assertEqual("text/plain", testCase.response.mediaType);
    assertEqual("utf-8", testCase.response.charset);
    assertEqual("0123456789", testCase.response.body);
  });

  it("response body with lazy enumerator", async () => {
    testCase.app = rackishApp(
      { "Content-Type": "text/plain" },
      (async function* () {
        for (let n = 0; n <= 10; n++) yield String(n);
      })(),
    );
    await testCase.get("/");
    testCase.assertResponse("success");

    assertEqual("text/plain", testCase.response.headers.get("Content-Type"));
    assertEqual("text/plain", testCase.response.contentType);
    assertEqual("text/plain", testCase.response.mediaType);
    assertEqual("utf-8", testCase.response.charset);
    assertEqual("012345678910", testCase.response.body);
  });
});
