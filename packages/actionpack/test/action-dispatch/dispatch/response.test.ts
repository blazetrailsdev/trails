import { beforeEach, describe, it, expect } from "vitest";
import { Request } from "../../../lib/action-dispatch/http/request.js";
import { Response } from "../../../lib/action-dispatch/http/response.js";
import { IOError } from "@blazetrails/ruby-compat/io-error";
import {
  assert,
  assertEqual,
  assertNil,
  assertNot,
  assertEmpty,
  assertNotRespondTo,
  assertRaises,
} from "@blazetrails/activesupport/testing/assertions";
import { flatten } from "@blazetrails/ruby-compat/array";
import {
  ContentLength,
  MockRequest,
  type RackBody as RackBodyType,
  type RackEnv,
  type RackResponse,
} from "@blazetrails/rack";
import { RackBody } from "../../../lib/action-dispatch/http/response.js";
import { Mime } from "../../../lib/action-dispatch/http/mime-type.js";
import { IntegrationTest } from "../../../lib/action-dispatch/testing/integration.js";
import { CookieAssertions, HeadersAssertions } from "../../support/abstract-unit.js";

const self = {
  ...HeadersAssertions,
  ...CookieAssertions,
  response: { headers: new Map<string, string | string[]>() },
};

async function newResponse(): Promise<Response> {
  const response = await Response.create();
  response.request = Request.empty();
  return response;
}

describe("ResponseTest", () => {
  it("simple output", async () => {
    const response = await newResponse();
    await response.setBody("Hello, World!");

    const [status, headers, body] = response.toA();
    assertEqual(200, status);

    self.assertHeaders({ "content-type": "text/html; charset=utf-8" }, headers);

    const parts: unknown[] = [];
    (body as RackBody).each((part: unknown) => parts.push(part));
    assertEqual(["Hello, World!"], parts);
  });

  it("status handled properly in initialize", async () => {
    assertEqual(200, (await Response.new("200 OK")).status);
  });

  it("response code", async () => {
    const response = await newResponse();
    response.status = "200 OK";
    assertEqual(200, response.responseCode);

    response.status = "200";
    assertEqual(200, response.responseCode);

    response.status = 200;
    assertEqual(200, response.responseCode);
  });

  it("message", async () => {
    const response = await newResponse();
    response.status = "200 OK";
    assertEqual("OK", response.message);

    response.status = "200";
    assertEqual("OK", response.message);

    response.status = 200;
    assertEqual("OK", response.message);
  });

  it("only set charset still defaults to text html", async () => {
    const response = await Response.new();
    response.charset = "utf-16";
    const [, headers] = response.toA();
    assertEqual("text/html; charset=utf-16", headers["content-type"]);
  });

  it("utf8 output", async () => {
    const response = await newResponse();
    await response.setBody(String.fromCodePoint(1090, 1077, 1089, 1090));

    const [status, headers] = response.toA();
    assertEqual(200, status);
    self.assertHeaders({ "content-type": "text/html; charset=utf-8" }, headers);
  });

  it("content length", async () => {
    for (const c of [100, 101, 102, 103, 204]) {
      const response = await Response.new();
      response.status = String(c);
      response.setHeader("Content-Length", "0");
      const [, headers] = response.toA();
      assertNot(
        Object.hasOwn(headers, "Content-Length"),
        `${c} must not have a Content-Length header field`,
      );
    }
  });

  it("does not contain a message-body", async () => {
    for (const c of [100, 101, 102, 103, 204, 304]) {
      const response = await Response.new();
      response.status = String(c);
      await response.setBody("Body must not be included");
      const [, , body] = response.toA();
      assertEmpty(body, `${c} must not have a message-body but actually contains ${body}`);
    }
  });

  it("content type", async () => {
    for (const c of [204, 304]) {
      const response = await Response.new();
      response.status = String(c);
      const [, headers] = response.toA();
      assertNot(Object.hasOwn(headers, "content-type"), `${c} should not have Content-Type header`);
    }

    for (const c of [200, 302, 404, 500]) {
      const response = await Response.new();
      response.status = String(c);
      const [, headers] = response.toA();
      assert(Object.hasOwn(headers, "content-type"), `${c} did not have Content-Type header`);
    }
  });

  it("empty content type returns nil", async () => {
    const res = await Response.new();
    expect(res.contentType).toBeNull();
  });

  it("setting content type header impacts content type method", async () => {
    const response = await newResponse();
    response.headers.set("Content-Type", "application/aaron");
    assertEqual("application/aaron", response.contentType);
  });

  it("response charset writer", async () => {
    const response = await newResponse();
    response.charset = "utf-16";
    assertEqual("utf-16", response.charset);
    response.charset = null;
    assertEqual("utf-8", response.charset);
  });

  it("cookies", async () => {
    const res = await Response.new();
    res.setCookie("user_name", { value: "david", path: "/" });
    const [, headers] = res.toA();
    self.assertSetCookieHeader("user_name=david; path=/", headers["set-cookie"]);
    expect(res.cookies).toEqual({ user_name: "david" });
  });

  it("multiple cookies", async () => {
    const res = await Response.new();
    res.setCookie("user_name", { value: "david", path: "/" });
    res.setCookie("login", {
      value: "foo&bar",
      path: "/",
      expires: new Date(Date.UTC(2005, 9, 10, 5)),
    });
    const [, headers] = res.toA();
    self.assertSetCookieHeader(
      "user_name=david; path=/\nlogin=foo%26bar; path=/; expires=Mon, 10 Oct 2005 05:00:00 GMT",
      headers["set-cookie"],
    );
    expect(res.cookies).toEqual({ login: "foo&bar", user_name: "david" });
  });

  it("delete cookies", async () => {
    const res = await Response.new();
    res.setCookie("user_name", { value: "david", path: "/" });
    res.setCookie("login", {
      value: "foo&bar",
      path: "/",
      expires: new Date(Date.UTC(2005, 9, 10, 5)),
    });
    res.deleteCookie("login");
    expect(res.cookies).toStrictEqual({ user_name: "david", login: null });
  });

  it("read ETag and Cache-Control", async () => {
    const resp = await Response.new();
    resp.cacheControl.public = true;
    resp.etag = "123";
    await resp.setBody("Hello");
    resp.toA();

    assert(resp.isEtag);
    assert(resp.isWeakEtag());
    assertNot(resp.isStrongEtag());
    assertEqual('W/"202cb962ac59075b964b07152d234b70"', resp.etag);
    assertEqual({ public: true }, resp.cacheControl);

    assertEqual("public", resp.headers.get("Cache-Control"));
    assertEqual('W/"202cb962ac59075b964b07152d234b70"', resp.headers.get("ETag"));
  });

  it("read strong ETag", async () => {
    const resp = await Response.new();
    resp.cacheControl.public = true;
    resp.strongEtag("123");
    await resp.setBody("Hello");
    resp.toA();

    assert(resp.isEtag);
    assertNot(resp.isWeakEtag());
    assert(resp.isStrongEtag());
    assertEqual('"202cb962ac59075b964b07152d234b70"', resp.etag);
  });

  it("read charset and content type", async () => {
    const resp = await Response.new();
    resp.charset = "utf-16";
    resp.contentType = Mime.get(":xml")!;
    await resp.setBody("Hello");
    resp.toA();

    assertEqual("utf-16", resp.charset);
    assertEqual(Mime.get(":xml")!.toString(), resp.mediaType);
    assertEqual("application/xml; charset=utf-16", resp.contentType);
    assertEqual("application/xml; charset=utf-16", resp.headers.get("Content-Type"));
  });

  it("respect no-store cache-control", async () => {
    const res = await Response.new();
    res._cacheControl = "no-store";
    expect(res._cacheControl).toBe("no-store");
  });

  it("respect private, no-store cache-control", async () => {
    const res = await Response.new();
    res._cacheControl = "private, no-store";
    expect(res._cacheControl).toBe("private, no-store");
  });

  it("does not include Status header", async () => {
    const response = await newResponse();
    response.status = "200 OK";
    const [, headers] = response.toA();
    assertNot(Object.hasOwn(headers, "status"));
  });

  it("can wait until commit", async () => {
    const response = await newResponse();
    const t = response.awaitCommit();
    response.commitBang();
    assert(response.committed);
    assert(
      await Promise.race([t.then(() => true), new Promise((r) => setTimeout(() => r(false), 500))]),
    );
  });

  it("stream close", async () => {
    const response = await newResponse();
    const stream = response.stream as { close(): void; isClosed: boolean };
    stream.close();
    assert(stream.isClosed);
  });

  it("stream write", async () => {
    const response = await newResponse();
    const stream = response.stream as { write(s: string): void; close(): void };
    stream.write("foo");
    stream.close();
    assertEqual("foo", response.body);
  });

  it("write after close", async () => {
    const res = await Response.new();
    res.close();

    const e = await assertRaises([IOError], {}, () => {
      res.write("more");
    });
    expect(e.message).toBe("closed stream");
  });

  it("each isnt called if str body is written", async () => {
    const response = await newResponse();
    let eachCounter = 0;
    await response.setBody({
      each(block: (chunk: string) => void) {
        eachCounter += 1;
        block("foo");
      },
    });
    response.setHeader("X-Foo", response.body);

    assertEqual(1, eachCounter, "#each was not called once");

    const [status, headers, body] = response.toA();

    assertEqual(200, status);
    assertEqual("foo", headers["x-foo"]);
    const chunks: string[] = [];
    (body as { each(block: (chunk: string) => void): void }).each((c) => chunks.push(c));
    assertEqual("foo", chunks.join(""));

    assertEqual(1, eachCounter, "#each was not called once");
  });

  it("response body encoding", async () => {
    const body = ["hello"];
    const response = await Response.new(200, {}, body);
    response.request = Request.empty();
    assertEqual("hello", response.body);
  });

  it("set header after read body during action", async () => {
    const response = await newResponse();
    void response.body;

    response.setHeader("x-header", "Best of all possible worlds.");

    const [status, headers, body] = response.toA();
    assertEqual(200, status);
    assertEqual("", (body as RackBody).body);

    assertEqual("Best of all possible worlds.", headers["x-header"]);
  });

  it("read body during action", async () => {
    const response = await newResponse();
    await response.setBody("Hello, World!");

    assertNil(response.contentType);

    assertEqual("Hello, World!", response.body);

    const [status, headers, body] = response.toA();
    assertEqual(200, status);
    self.assertHeaders({ "content-type": "text/html; charset=utf-8" }, headers);

    const parts: unknown[] = [];
    (body as RackBody).each((part: unknown) => parts.push(part));
    assertEqual(["Hello, World!"], parts);
  });

  it("code", async () => {
    const response = await newResponse();
    response.status = "200 OK";
    assertEqual("200", response.code);

    response.status = "200";
    assertEqual("200", response.code);

    response.status = 200;
    assertEqual("200", response.code);
  });

  it("read content type with default charset utf-8", async () => {
    const res = await Response.new(200, { "Content-Type": "text/xml" });
    expect(res.charset).toBe("utf-8");
  });

  it("read content type with charset utf-16", async () => {
    const original = Response.defaultCharset;
    try {
      Response.defaultCharset = "utf-16";
      const res = await Response.new(200, { "Content-Type": "text/xml" });
      expect(res.charset).toBe("utf-16");
    } finally {
      Response.defaultCharset = original;
    }
  });

  it("read x_frame_options, x_content_type_options, x_xss_protection, x_permitted_cross_domain_policies and referrer_policy", async () => {
    const original = Response.defaultHeaders;
    try {
      Response.defaultHeaders = {
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
        "X-XSS-Protection": "0",
        "X-Permitted-Cross-Domain-Policies": "none",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      };
      const resp = await Response.create();
      await resp.setBody("Hello");
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

  it("read custom default_header", async () => {
    const original = Response.defaultHeaders;
    try {
      Response.defaultHeaders = {
        "X-XX-XXXX": "Here is my phone number",
      };
      const resp = await Response.create();
      await resp.setBody("Hello");
      resp.toA();
      expect(resp.headers.get("X-XX-XXXX")).toBe("Here is my phone number");
    } finally {
      Response.defaultHeaders = original;
    }
  });

  it("respond_to? accepts include_private", () => {
    assertNotRespondTo(newResponse(), "methodMissing");
  });

  it("can be explicitly destructured into status, headers and an enumerable body", async () => {
    const res = await Response.new(404, { "Content-Type": "text/plain" }, ["Not Found"]);
    const [status, headers, body] = res.toA() as [
      number,
      Record<string, string>,
      Iterable<unknown>,
    ];
    expect(status).toBe(404);
    expect(headers["content-type"]).toBe("text/plain");
    expect([...body]).toEqual(["Not Found"]);
  });

  it("[response.to_a].flatten does not recurse infinitely", async () => {
    const response = await newResponse();
    const [status, headers, body] = flatten([response.toA()]);
    assertEqual(200, status);
    assertEqual(headers, response.headers.toHash());
    assertNil(body);
  });

  it("compatibility with Rack::ContentLength", async () => {
    const response = await newResponse();
    await response.setBody("Hello");
    const app = (_env: RackEnv) => response.toA() as unknown as RackResponse;
    const env = MockRequest.envFor("/");

    let [, headers] = await app(env);
    self.assertNotHeader("content-length", headers);

    [, headers] = await new ContentLength(app).call(env);
    self.assertHeader("content-length", "5", headers);
  });
});

describe("ResponseHeadersTest", () => {
  it("has_header?", async () => {
    const response = await Response.create();
    response.setHeader("Foo", "1");
    assert(response.hasHeader("Foo"));
    assert(response.hasHeader("foo"));
  });

  it("get_header", async () => {
    const res = await Response.create();
    res.setHeader("Foo", "1");
    expect(res.getHeader("Foo")).toBe("1");
    expect(res.getHeader("foo")).toBe("1");
  });

  it("set_header", async () => {
    const response = await Response.create();
    response.setHeader("Foo", "1");
    assertEqual("2", response.setHeader("Foo", "2"));
    assert(response.hasHeader("Foo"));
    assertEqual("2", response.getHeader("Foo"));

    assertNil(response.setHeader("Foo", null));
    assert(response.hasHeader("Foo"));
    assertNil(response.getHeader("Foo"));
  });

  it("delete_header", async () => {
    const response = await Response.create();
    response.setHeader("Foo", "1");
    assertEqual("1", response.deleteHeader("Foo"));
    assertNot(response.hasHeader("Foo"));
  });

  it("add_header", async () => {
    const response = await Response.create();
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

  function trailsishApp(block: (resp: Response) => void) {
    return async () => {
      const resp = await Response.new();
      block(resp);
      resp.request = Request.empty();
      return resp.toA();
    };
  }

  function rackishApp(headers: Record<string, string>, body: RackBodyType = ["Hello"]) {
    return (): RackResponse => [200, headers, body];
  }

  it("response cache control from railsish app", async () => {
    testCase.app = trailsishApp(async (resp) => {
      resp.cacheControl.public = true;
      resp.etag = "123";
      await resp.setBody("Hello");
    });

    await testCase.get("/");
    testCase.assertResponse(":success");

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
    testCase.assertResponse(":success");

    assertEqual("public", testCase.response.headers.get("Cache-Control"));
    assertEqual('W/"202cb962ac59075b964b07152d234b70"', testCase.response.headers.get("ETag"));

    assertEqual('W/"202cb962ac59075b964b07152d234b70"', testCase.response.etag);
    assertEqual({ public: true }, testCase.response.cacheControl);
  });

  it("response charset and content type from railsish app", async () => {
    testCase.app = trailsishApp(async (resp) => {
      resp.charset = "utf-16";
      resp.contentType = Mime.get("xml")!;
      await resp.setBody("Hello");
    });

    await testCase.get("/");
    testCase.assertResponse(":success");

    assertEqual("utf-16", testCase.response.charset);
    assertEqual(Mime.get("xml"), testCase.response.mediaType);
    assertEqual("application/xml; charset=utf-16", testCase.response.contentType);
    assertEqual("application/xml; charset=utf-16", testCase.response.headers.get("Content-Type"));
  });

  it("response charset and content type from rackish app", async () => {
    testCase.app = rackishApp({ "Content-Type": "application/xml; charset=utf-16" });

    await testCase.get("/");
    testCase.assertResponse(":success");

    assertEqual("utf-16", testCase.response.charset);
    assertEqual(Mime.get("xml"), testCase.response.mediaType);
    assertEqual("application/xml; charset=utf-16", testCase.response.contentType);
    assertEqual("application/xml; charset=utf-16", testCase.response.headers.get("Content-Type"));
  });

  it("strong ETag validator", async () => {
    testCase.app = trailsishApp(async (resp) => {
      resp.strongEtag("123");
      await resp.setBody("Hello");
    });

    await testCase.get("/");
    testCase.assertResponse(":ok");

    assertEqual('"202cb962ac59075b964b07152d234b70"', testCase.response.headers.get("ETag"));
    assertEqual('"202cb962ac59075b964b07152d234b70"', testCase.response.etag);
  });

  it("response Content-Type with optional parameters", async () => {
    testCase.app = rackishApp({ "Content-Type": "text/csv; charset=utf-16; header=present" });

    await testCase.get("/");
    testCase.assertResponse(":success");

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
    testCase.assertResponse(":success");

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
    testCase.assertResponse(":success");

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
      (function* () {
        for (let n = 0; n < 10; n++) yield String(n);
      })(),
    );
    await testCase.get("/");
    testCase.assertResponse(":success");

    assertEqual("text/plain", testCase.response.headers.get("Content-Type"));
    assertEqual("text/plain", testCase.response.contentType);
    assertEqual("text/plain", testCase.response.mediaType);
    assertEqual("utf-8", testCase.response.charset);
    assertEqual("0123456789", testCase.response.body);
  });

  it("response body with lazy enumerator", async () => {
    testCase.app = rackishApp(
      { "Content-Type": "text/plain" },
      (function* () {
        for (let n = 0; n <= 10; n++) yield String(n);
      })(),
    );
    await testCase.get("/");
    testCase.assertResponse(":success");

    assertEqual("text/plain", testCase.response.headers.get("Content-Type"));
    assertEqual("text/plain", testCase.response.contentType);
    assertEqual("text/plain", testCase.response.mediaType);
    assertEqual("utf-8", testCase.response.charset);
    assertEqual("012345678910", testCase.response.body);
  });
});
