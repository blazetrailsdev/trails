import { assertEmpty } from "@blazetrails/activesupport";
import { beforeEach, describe, expect, it } from "vitest";
import type { MockResponse, Request } from "@blazetrails/rack";
import { FAKE_APP } from "./fixtures/fake-app.js";
import { Error as RackTestError, Session } from "./index.js";
import { mustBe, wontBe } from "./test-helpers/assertions.js";

const app = FAKE_APP;

let session: Session;

beforeEach(() => {
  session = new Session(app);
});

const request = (
  uri: string,
  env: Record<string, unknown> = {},
  block?: (r: MockResponse) => void,
) => session.request(uri, env, block);
const lastRequest = (): Request => session.lastRequest();
const lastResponse = (): MockResponse => session.lastResponse();

describe("Rack::Test::Session", () => {
  it("supports being initialized with a Rack::MockSession app", async () => {
    mustBe(await Session.new(new Session(app)).request("/"), "isOk");
  });

  it("supports being initialized with an app", async () => {
    mustBe(await Session.new(app).request("/"), "isOk");
  });
});

describe("Rack::Test::Session#request", () => {
  it("requests the URI using GET by default", async () => {
    await request("/");
    expect(lastRequest().env["REQUEST_METHOD"]).toBe("GET");
    mustBe(lastResponse(), "isOk");
  });

  it("returns last response", async () => {
    mustBe(await request("/"), "isOk");
  });

  it("uses the provided env", async () => {
    await request("/", { "X-Foo": "bar" });
    expect(lastRequest().env["X-Foo"]).toBe("bar");
  });

  it("allows HTTP_HOST to be set", async () => {
    await request("/", { HTTP_HOST: "www.example.ua" });
    expect(lastRequest().env["HTTP_HOST"]).toBe("www.example.ua");
  });

  it("sets HTTP_HOST with port for non-default ports", async () => {
    await request("http://foo.com:8080");
    expect(lastRequest().env["HTTP_HOST"]).toBe("foo.com:8080");
    await request("https://foo.com:8443");
    expect(lastRequest().env["HTTP_HOST"]).toBe("foo.com:8443");
  });

  it("sets HTTP_HOST without port for default ports", async () => {
    await request("http://foo.com");
    expect(lastRequest().env["HTTP_HOST"]).toBe("foo.com");
    await request("http://foo.com:80");
    expect(lastRequest().env["HTTP_HOST"]).toBe("foo.com");
    await request("https://foo.com:443");
    expect(lastRequest().env["HTTP_HOST"]).toBe("foo.com");
  });

  it("defaults the REMOTE_ADDR to 127.0.0.1", async () => {
    await request("/");
    expect(lastRequest().env["REMOTE_ADDR"]).toBe("127.0.0.1");
  });

  it("sets rack.test to true in the env", async () => {
    await request("/");
    expect(lastRequest().env["rack.test"]).toBe(true);
  });

  it("defaults to port 80", async () => {
    await request("/");
    expect(lastRequest().env["SERVER_PORT"]).toBe("80");
  });

  it("defaults to example.org", async () => {
    await request("/");
    expect(lastRequest().env["SERVER_NAME"]).toBe("example.org");
  });

  it("yields the response to a given block", async () => {
    await request("/", {}, (response) => {
      mustBe(response, "isOk");
    });
  });

  it("supports sending :params for GET", async () => {
    await request("/", { ":params": { foo: "bar" } });
    expect(lastRequest().GET["foo"]).toBe("bar");
  });

  it("supports sending :query_params for GET", async () => {
    await request("/", { ":query_params": { foo: "bar" } });
    expect(lastRequest().GET["foo"]).toBe("bar");
  });

  it("supports sending both :params and :query_params for GET", async () => {
    await request("/", { ":query_params": { foo: "bar" }, ":params": { foo2: "bar2" } });
    expect(lastRequest().GET["foo"]).toBe("bar");
    expect(lastRequest().GET["foo2"]).toBe("bar2");
  });

  it("supports sending :params for POST", async () => {
    await request("/", { ":method": "post", ":params": { foo: "bar" } });
    expect(lastRequest().POST["foo"]).toBe("bar");
  });

  it("does not use multipart input for :params for POST by default", async () => {
    await request("/", { ":method": "post", ":params": { foo: "bar" } });
    expect(lastRequest().POST["foo"]).toBe("bar");
    lastRequest().env["rack.input"].rewind();
    expect(lastRequest().env["rack.input"].read()).toBe("foo=bar");
  });

  it("supports :multipart when using :params for POST to force multipart input", async () => {
    await request("/", { ":method": "post", ":params": { foo: "bar" }, ":multipart": true });
    expect(lastRequest().POST["foo"]).toBe("bar");
    lastRequest().env["rack.input"].rewind();
    expect(lastRequest().env["rack.input"].read()).toContain(
      'content-disposition: form-data; name="foo"',
    );
  });

  it("supports multipart CONTENT_TYPE when using :params for POST to force multipart input", async () => {
    await request("/", {
      ":method": "post",
      ":params": { foo: "bar" },
      CONTENT_TYPE: "multipart/form-data",
    });
    expect(lastRequest().POST["foo"]).toBe("bar");
    lastRequest().env["rack.input"].rewind();
    expect(lastRequest().env["rack.input"].read()).toContain(
      'content-disposition: form-data; name="foo"',
    );
  });

  it("supports multipart CONTENT_TYPE when using empty :params for POST to be empty body", async () => {
    await request("/", {
      ":method": "post",
      ":params": {},
      CONTENT_TYPE: "multipart/form-data",
    });
    assertEmpty({ ...lastRequest().POST });
    lastRequest().env["rack.input"].rewind();
    assertEmpty(lastRequest().env["rack.input"].read());
  });

  it("supports sending :query_params for POST", async () => {
    await request("/", { ":method": "post", ":query_params": { foo: "bar" } });
    expect(lastRequest().GET["foo"]).toBe("bar");
  });

  it("supports sending both :params and :query_params for POST", async () => {
    await request("/", {
      ":method": "post",
      ":query_params": { foo: "bar" },
      ":params": { foo2: "bar2" },
    });
    expect(lastRequest().GET["foo"]).toBe("bar");
    expect(lastRequest().POST["foo2"]).toBe("bar2");
  });

  it("doesn't follow redirects by default", async () => {
    await request("/redirect");
    mustBe(lastResponse(), "isRedirect");
    assertEmpty(lastResponse().getBody());
  });

  it("allows passing :input in for POSTs", async () => {
    await request("/", { ":method": "post", ":input": "foo" });
    expect(lastRequest().env["rack.input"].read()).toBe("foo");
  });

  it("converts method names to a uppercase strings", async () => {
    await request("/", { ":method": "put" });
    expect(lastRequest().env["REQUEST_METHOD"]).toBe("PUT");
  });

  it("prepends a slash to the URI path", async () => {
    await request("foo");
    expect(lastRequest().env["PATH_INFO"]).toBe("/foo");
  });

  it("accepts params and builds query strings for GET requests", async () => {
    await request("/foo?baz=2", { ":params": { foo: { bar: "1" } } });
    expect(lastRequest().GET).toEqual({ baz: "2", foo: { bar: "1" } });
  });

  it("parses query strings with repeated variable names correctly", async () => {
    await request("/foo?bar=2&bar=3");
    expect(lastRequest().GET).toEqual({ bar: "3" });
  });

  it("accepts raw input in params for GET requests", async () => {
    await request("/foo?baz=2", { ":params": "foo[bar]=1" });
    expect(lastRequest().GET).toEqual({ baz: "2", foo: { bar: "1" } });
  });

  it("does not rewrite a GET query string when :params is not supplied", async () => {
    await request("/foo?a=1&b=2&c=3&e=4&d=5+%20");
    expect(lastRequest().queryString).toBe("a=1&b=2&c=3&e=4&d=5+%20");
  });

  it("does not rewrite a GET query string when :params is empty", async () => {
    await request("/foo?a=1&b=2&c=3&e=4&d=5", { ":params": {} });
    expect(lastRequest().queryString).toBe("a=1&b=2&c=3&e=4&d=5");
  });

  it("does not overwrite multiple query string keys", async () => {
    await request("/foo?a=1&a=2", { ":params": { bar: 1 } });
    expect(lastRequest().queryString).toBe("a=1&a=2&bar=1");
  });

  it("accepts params and builds url encoded params for POST requests", async () => {
    await request("/foo", { ":method": "post", ":params": { foo: { bar: "1" } } });
    expect(lastRequest().env["rack.input"].read()).toBe("foo[bar]=1");
  });

  it("accepts raw input in params for POST requests", async () => {
    await request("/foo", { ":method": "post", ":params": "foo[bar]=1" });
    expect(lastRequest().env["rack.input"].read()).toBe("foo[bar]=1");
  });

  it("sends the input when input is given", async () => {
    await request("/", { ":method": "POST", ":input": "foo" });
    expect(lastRequest().env["rack.input"].read()).toBe("foo");
  });

  it("does not send a multipart request when input is given", async () => {
    await request("/", { ":method": "POST", ":input": "foo" });
    expect(lastRequest().env["CONTENT_TYPE"]).not.toBe("application/x-www-form-urlencoded");
  });

  it("uses application/x-www-form-urlencoded as the CONTENT_TYPE for a POST specified with :method", async () => {
    await request("/", { ":method": "POST" });
    expect(lastRequest().env["CONTENT_TYPE"]).toBe("application/x-www-form-urlencoded");
  });

  it("uses application/x-www-form-urlencoded as the CONTENT_TYPE for a POST specified with REQUEST_METHOD", async () => {
    await request("/", { REQUEST_METHOD: "POST" });
    expect(lastRequest().env["CONTENT_TYPE"]).toBe("application/x-www-form-urlencoded");
  });

  it("does not overwrite the CONTENT_TYPE when CONTENT_TYPE is specified in the env", async () => {
    await request("/", { CONTENT_TYPE: "application/xml" });
    expect(lastRequest().env["CONTENT_TYPE"]).toBe("application/xml");
  });

  it("sets rack.url_scheme to https when the URL is https://", async () => {
    await request("https://example.org/");
    expect(lastRequest().env["rack.url_scheme"]).toBe("https");
  });

  it("sets SERVER_PORT to 443 when the URL is https://", async () => {
    await request("https://example.org/");
    expect(lastRequest().env["SERVER_PORT"]).toBe("443");
  });

  it("sets HTTPS to on when the URL is https://", async () => {
    await request("https://example.org/");
    expect(lastRequest().env["HTTPS"]).toBe("on");
  });

  it("sends XMLHttpRequest for the X-Requested-With header if :xhr option is given", async () => {
    await request("/", { ":xhr": true });
    expect(lastRequest().env["HTTP_X_REQUESTED_WITH"]).toBe("XMLHttpRequest");
    mustBe(lastRequest(), "xhr");
  });
});

describe("Rack::Test::Session#header", () => {
  it("sets a header to be sent with requests", async () => {
    session.header("User-Agent", "Firefox");
    await request("/");

    expect(lastRequest().env["HTTP_USER_AGENT"]).toBe("Firefox");
  });

  it("sets a content-type to be sent with requests", async () => {
    session.header("content-type", "application/json");
    await request("/");

    expect(lastRequest().env["CONTENT_TYPE"]).toBe("application/json");
  });

  it("sets a Host to be sent with requests", async () => {
    session.header("Host", "www.example.ua");
    await request("/");

    expect(lastRequest().env["HTTP_HOST"]).toBe("www.example.ua");
  });

  it("persists across multiple requests", async () => {
    session.header("User-Agent", "Firefox");
    await request("/");
    await request("/");

    expect(lastRequest().env["HTTP_USER_AGENT"]).toBe("Firefox");
  });

  it("overwrites previously set headers", async () => {
    session.header("User-Agent", "Firefox");
    session.header("User-Agent", "Safari");
    await request("/");

    expect(lastRequest().env["HTTP_USER_AGENT"]).toBe("Safari");
  });

  it("can be used to clear a header", async () => {
    session.header("User-Agent", "Firefox");
    session.header("User-Agent", null);
    await request("/");

    expect(Object.keys(lastRequest().env)).not.toContain("HTTP_USER_AGENT");
  });

  it("is overridden by headers sent during the request", async () => {
    session.header("User-Agent", "Firefox");
    await request("/", { HTTP_USER_AGENT: "Safari" });

    expect(lastRequest().env["HTTP_USER_AGENT"]).toBe("Safari");
  });
});

describe("Rack::Test::Session#env", () => {
  it("sets the env to be sent with requests", async () => {
    session.env("rack.session", { csrf: "token" });
    await request("/");

    expect(lastRequest().env["rack.session"]).toEqual({ csrf: "token" });
  });

  it("persists across multiple requests", async () => {
    session.env("rack.session", { csrf: "token" });
    await request("/");
    await request("/");

    expect(lastRequest().env["rack.session"]).toEqual({ csrf: "token" });
  });

  it("overwrites previously set envs", async () => {
    session.env("rack.session", { csrf: "token" });
    session.env("rack.session", { some: ":thing" });
    await request("/");

    expect(lastRequest().env["rack.session"]).toEqual({ some: ":thing" });
  });

  it("can be used to clear a env", async () => {
    session.env("rack.session", { csrf: "token" });
    session.env("rack.session", null);
    await request("/");

    expect(Object.keys(lastRequest().env)).not.toContain("X_CSRF_TOKEN");
  });

  it("is overridden by envs sent during the request", async () => {
    session.env("rack.session", { csrf: "token" });
    await request("/", { "rack.session": { some: ":thing" } });

    expect(lastRequest().env["rack.session"]).toEqual({ some: ":thing" });
  });
});

describe("Rack::Test::Session#basic_authorize", () => {
  it("sets the HTTP_AUTHORIZATION header", async () => {
    session.basicAuthorize("bryan", "secret");
    await request("/");

    expect(lastRequest().env["HTTP_AUTHORIZATION"]).toBe("Basic YnJ5YW46c2VjcmV0");
  });

  it("includes the header for subsequent requests", async () => {
    session.basicAuthorize("bryan", "secret");
    await request("/");
    await request("/");

    expect(lastRequest().env["HTTP_AUTHORIZATION"]).toBe("Basic YnJ5YW46c2VjcmV0");
  });
});

describe("Rack::Test::Session#follow_redirect!", () => {
  it("follows redirects", async () => {
    await session.get("/redirect");
    await session.followRedirectBang();

    wontBe(lastResponse(), "isRedirect");
    expect(lastResponse().bodyString).toBe("You've been redirected, session {} with options {}");
    expect(lastRequest().env["HTTP_REFERER"]).toBe("http://example.org/redirect");
  });

  it("follows absolute redirects", async () => {
    await session.get("/absolute/redirect");
    expect(lastResponse().getHeader("location")).toBe("https://www.google.com");
    await session.followRedirectBang();
    expect(lastRequest().env["PATH_INFO"]).toBe("/");
    expect(lastRequest().env["HTTP_HOST"]).toBe("www.google.com");
    expect(lastRequest().env["HTTPS"]).toBe("on");
  });

  it("follows nested redirects", async () => {
    await session.get("/nested/redirect");

    expect(lastResponse().getHeader("location")).toBe("redirected");
    await session.followRedirectBang();

    mustBe(lastResponse(), "isOk");
    expect(lastRequest().env["PATH_INFO"]).toBe("/nested/redirected");
  });

  it("does not include params when following the redirect", async () => {
    await session.get("/redirect", { foo: "bar" });
    await session.followRedirectBang();

    assertEmpty(lastRequest().GET);
  });

  it("includes session when following the redirect", async () => {
    await session.get("/redirect", {}, { "rack.session": { foo: "bar" } });
    await session.followRedirectBang();

    expect(lastResponse().bodyString).toMatch(/session \{"foo" ?=> ?"bar"\}/);
  });

  it("includes session options when following the redirect", async () => {
    await session.get("/redirect", {}, { "rack.session.options": { foo: "bar" } });
    await session.followRedirectBang();

    expect(lastResponse().bodyString).toMatch(/session \{\} with options \{"foo" ?=> ?"bar"\}/);
  });

  it("raises an error if the last_response is not set", async () => {
    await expect(session.followRedirectBang()).rejects.toThrow(RackTestError);
  });

  it("raises an error if the last_response is not a redirect", async () => {
    await session.get("/");

    await expect(session.followRedirectBang()).rejects.toThrow(RackTestError);
  });

  it("keeps the original method and params for HTTP 307", async () => {
    await session.post("/redirect?status=307", { foo: "bar" });
    await session.followRedirectBang();
    expect(lastResponse().bodyString).toContain("post");
    expect(lastResponse().bodyString).toContain("foo");
    expect(lastResponse().bodyString).toContain("bar");
  });
});

describe("Rack::Test::Session#last_request", () => {
  it("returns the most recent request", async () => {
    await request("/");
    expect(lastRequest().env["PATH_INFO"]).toBe("/");
  });

  it("raises an error if no requests have been issued", () => {
    expect(() => {
      lastRequest();
    }).toThrow(RackTestError);
  });
});

describe("Rack::Test::Session#last_response", () => {
  it("returns the most recent response", async () => {
    await request("/");
    expect(lastResponse().getHeader("content-type")).toBe("text/html;charset=utf-8");
  });

  it("raises an error if no requests have been issued", () => {
    expect(() => {
      lastResponse();
    }).toThrow(RackTestError);
  });
});

describe("Rack::Test::Session#after_request", () => {
  it("runs callbacks after each request", async () => {
    let ran = false;

    session.afterRequest(() => {
      ran = true;
    });

    await session.get("/");
    expect(ran).toBe(true);
  });

  it("runs multiple callbacks", async () => {
    let count = 0;

    for (let i = 0; i < 2; i++) {
      session.afterRequest(() => {
        count += 1;
      });
    }

    await session.get("/");
    expect(count).toBe(2);
  });
});

type Verb = "get" | "post" | "put" | "patch" | "delete" | "options" | "head";

function verbExamples(verb: Verb): void {
  it("requests the URL using VERB", async () => {
    await session[verb]("/");

    expect(lastRequest().env["REQUEST_METHOD"]).toBe(verb.toUpperCase());
    mustBe(lastResponse(), "isOk");
  });

  it("uses the provided env", async () => {
    await session[verb]("/", {}, { HTTP_USER_AGENT: "Rack::Test" });
    expect(lastRequest().env["HTTP_USER_AGENT"]).toBe("Rack::Test");
  });

  it("yields the response to a given block", async () => {
    let yielded = false;

    await session[verb]("/", {}, {}, (response) => {
      mustBe(response, "isOk");
      yielded = true;
    });

    expect(yielded).toBe(true);
  });

  it("sets the HTTP_HOST header with port", async () => {
    await session[verb]("http://example.org:8080/uri");
    expect(lastRequest().env["HTTP_HOST"]).toBe("example.org:8080");
  });

  it("sets the HTTP_HOST header without port", async () => {
    await session[verb]("/uri");
    expect(lastRequest().env["HTTP_HOST"]).toBe("example.org");
  });

  it("sends XMLHttpRequest for the X-Requested-With header", async () => {
    await session[verb]("/", {}, { ":xhr": true });
    expect(lastRequest().env["HTTP_X_REQUESTED_WITH"]).toBe("XMLHttpRequest");
    mustBe(lastRequest(), "xhr");
  });
}

function nonGetVerbExamples(verb: Verb): void {
  it("sets CONTENT_TYPE to application/x-www-form-urlencoded when params are not provided", async () => {
    await session[verb]("/");
    expect(lastRequest().env["CONTENT_TYPE"]).toBe("application/x-www-form-urlencoded");
  });

  it("sets CONTENT_LENGTH to zero when params are not provided", async () => {
    await session[verb]("/");
    expect(lastRequest().env["CONTENT_LENGTH"]).toBe("0");
  });

  it("sets CONTENT_TYPE to application/x-www-form-urlencoded when params are explicitly set to nil", async () => {
    await session[verb]("/", null);
    expect(lastRequest().env["CONTENT_TYPE"]).toBe("application/x-www-form-urlencoded");
  });

  it("sets CONTENT_LENGTH to 0 when params are explicitly set to nil", async () => {
    await session[verb]("/", null);
    expect(lastRequest().env["CONTENT_LENGTH"]).toBe("0");
  });
}

describe("Rack::Test::Session#get", () => {
  verbExamples("get");

  it("does not set CONTENT_TYPE when params are not provided", async () => {
    await session.get("/");
    expect(Object.keys(lastRequest().env)).not.toContain("CONTENT_TYPE");
  });

  it("sets CONTENT_LENGTH to zero or does not set it when params are not provided", async () => {
    await session.get("/");
    expect(["0", undefined]).toContain(lastRequest().env["CONTENT_LENGTH"]);
  });

  it("does not set CONTENT_TYPE twhen params are explicitly set to nil", async () => {
    await session.get("/", null);
    expect(Object.keys(lastRequest().env)).not.toContain("CONTENT_TYPE");
  });

  it("sets CONTENT_LENGTH to zero or does not set it when params are explicitly set to nil", async () => {
    await session.get("/", null);
    expect(["0", undefined]).toContain(lastRequest().env["CONTENT_LENGTH"]);
  });

  it("uses the provided params hash", async () => {
    await session.get("/", { foo: "bar" });
    expect(lastRequest().GET).toEqual({ foo: "bar" });
  });

  it("sends params with parens in names", async () => {
    await session.get("/", { "foo(1i)": "bar" });
    expect(lastRequest().GET["foo(1i)"]).toBe("bar");
  });

  it("supports params with encoding sensitive names", async () => {
    await session.get("/", { "foo bar": "baz" });
    expect(lastRequest().GET["foo bar"]).toBe("baz");
  });

  it("supports params with nested encoding sensitive names", async () => {
    await session.get("/", { boo: { "foo bar": "baz" } });
    expect(lastRequest().GET).toEqual({ boo: { "foo bar": "baz" } });
  });

  it("accepts params in the path", async () => {
    await session.get("/?foo=bar");
    expect(lastRequest().GET).toEqual({ foo: "bar" });
  });
});

describe("Rack::Test::Session#head", () => {
  verbExamples("head");
  nonGetVerbExamples("head");
});

describe("Rack::Test::Session#post", () => {
  verbExamples("post");
  nonGetVerbExamples("post");

  it("uses the provided params hash", async () => {
    await session.post("/", { foo: "bar" });
    expect(lastRequest().POST).toEqual({ foo: "bar" });
  });

  it("supports params with encoding sensitive names", async () => {
    await session.post("/", { "foo bar": "baz" });
    expect(lastRequest().POST["foo bar"]).toBe("baz");
  });

  it("uses application/x-www-form-urlencoded as the default CONTENT_TYPE", async () => {
    await session.post("/");
    expect(lastRequest().env["CONTENT_TYPE"]).toBe("application/x-www-form-urlencoded");
  });

  it("sets the CONTENT_LENGTH", async () => {
    await session.post("/", { foo: "bar" });
    expect(lastRequest().env["CONTENT_LENGTH"]).toBe("7");
  });

  it("accepts a body", async () => {
    await session.post("/", "Lobsterlicious!");
    expect(lastRequest().body.read()).toBe("Lobsterlicious!");
  });

  it("does not overwrite the CONTENT_TYPE when CONTENT_TYPE is specified in the env", async () => {
    await session.post("/", {}, { CONTENT_TYPE: "application/xml" });
    expect(lastRequest().env["CONTENT_TYPE"]).toBe("application/xml");
  });
});

describe("Rack::Test::Session#put", () => {
  verbExamples("put");
  nonGetVerbExamples("put");

  it("accepts a body", async () => {
    await session.put("/", "Lobsterlicious!");
    expect(lastRequest().body.read()).toBe("Lobsterlicious!");
  });
});

describe("Rack::Test::Session#patch", () => {
  verbExamples("patch");
  nonGetVerbExamples("patch");

  it("accepts a body", async () => {
    await session.patch("/", "Lobsterlicious!");
    expect(lastRequest().body.read()).toBe("Lobsterlicious!");
  });
});

describe("Rack::Test::Session#delete", () => {
  verbExamples("delete");
  nonGetVerbExamples("delete");

  it("accepts a body", async () => {
    await session.patch("/", "Lobsterlicious!");
    expect(lastRequest().body.read()).toBe("Lobsterlicious!");
  });

  it("uses the provided params hash", async () => {
    await session.delete("/", { foo: "bar" });
    expect(lastRequest().GET).toEqual({});
    expect(lastRequest().POST).toEqual({ foo: "bar" });
    lastRequest().body.rewind();
    expect(lastRequest().body.read()).toBe("foo=bar");
  });

  it("accepts params in the path", async () => {
    await session.delete("/?foo=bar");
    expect(lastRequest().GET).toEqual({ foo: "bar" });
    expect(lastRequest().POST).toEqual({});
    expect(lastRequest().body.read()).toBe("");
  });

  it("accepts a body", async () => {
    await session.delete("/", "Lobsterlicious!");
    expect(lastRequest().GET).toEqual({});
    expect(lastRequest().body.read()).toBe("Lobsterlicious!");
  });
});

describe("Rack::Test::Session#options", () => {
  verbExamples("options");
  nonGetVerbExamples("options");
});

describe("Rack::Test::Session#custom_request", () => {
  it("requests the URL using the given", async () => {
    await session.customRequest("link", "/");

    expect(lastRequest().env["REQUEST_METHOD"]).toBe("LINK");
    mustBe(lastResponse(), "isOk");
  });

  it("uses the provided env", async () => {
    await session.customRequest("link", "/", {}, { HTTP_USER_AGENT: "Rack::Test" });
    expect(lastRequest().env["HTTP_USER_AGENT"]).toBe("Rack::Test");
  });

  it("yields the response to a given block", async () => {
    let yielded = false;

    await session.customRequest("link", "/", {}, {}, (response) => {
      mustBe(response, "isOk");
      yielded = true;
    });

    expect(yielded).toBe(true);
  });

  it("sets the HTTP_HOST header with port", async () => {
    await session.customRequest("link", "http://example.org:8080/uri");
    expect(lastRequest().env["HTTP_HOST"]).toBe("example.org:8080");
  });

  it("sets the HTTP_HOST header without port", async () => {
    await session.customRequest("link", "/uri");
    expect(lastRequest().env["HTTP_HOST"]).toBe("example.org");
  });

  it("sends XMLHttpRequest for the X-Requested-With header for an XHR", async () => {
    await session.customRequest("link", "/", {}, { ":xhr": true });
    expect(lastRequest().env["HTTP_X_REQUESTED_WITH"]).toBe("XMLHttpRequest");
    mustBe(lastRequest(), "xhr");
  });
});

describe("Rack::Test::Session#restore_state", () => {
  it("restores last request, last response, cookies, and hooks after block", async () => {
    const afterRequest: number[] = [];
    session.afterRequest(() => afterRequest.push(1));

    await session.get("/");
    const request = lastRequest();
    const response = lastResponse();
    expect(session.cookieJar.get("simple")).toBeUndefined();
    expect(afterRequest).toEqual([1]);

    await session.restoreState(async () => {
      session.afterRequest(() => afterRequest.push(2));
      await session.get("/cookies/set-simple?value=foo");
      expect(session.cookieJar.get("simple")).toBe("foo");

      expect(lastRequest()).not.toBe(request);
      expect(lastResponse()).not.toBe(response);
      expect(afterRequest).toEqual([1, 1, 2]);
    });

    expect(lastRequest()).toBe(request);
    expect(lastResponse()).toBe(response);
    expect(session.cookieJar.get("simple")).toBeUndefined();

    await session.get("/");
    expect(afterRequest).toEqual([1, 1, 2, 1]);
  });
});
