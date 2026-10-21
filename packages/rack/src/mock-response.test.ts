import { Time } from "@blazetrails/date";
import { ArgumentError, StringIO } from "@blazetrails/ruby-compat";
import { Psych } from "@blazetrails/ruby-compat/psych";
import { describe, it, expect, beforeEach } from "vitest";
import { MockRequest, FatalWarning } from "./mock-request.js";
import { MockResponse } from "./mock-response.js";
import { Lint } from "./lint.js";
import { Request } from "./request.js";
import { Response } from "./response.js";

const app = new Lint((env: Record<string, any>) => {
  const req = new Request(env);
  const input = env["rack.input"];
  if (input) env["mock.postdata"] = input.read();
  if (req.GET["error"]) {
    env["rack.errors"].puts(req.GET["error"]);
    env["rack.errors"].flush();
  }
  const body = req.isHead() ? "" : Psych.dump(env);
  const response = new Response(body, req.GET["status"] || 200, { "content-type": "text/yaml" });
  response.setCookie("session_test", { value: "session_test", domain: "test.com", path: "/" });
  response.setCookie("secure_test", {
    value: "secure_test",
    domain: "test.com",
    path: "/",
    secure: true,
  });
  response.setCookie("persistent_test", {
    value: "persistent_test",
    maxAge: 15552000,
    path: "/",
  });
  response.setCookie("persistent_with_expires_test", {
    value: "persistent_with_expires_test",
    expires: Time.httpdate("Thu, 31 Oct 2021 07:28:00 GMT"),
    path: "/",
  });
  response.setCookie("expires_and_max-age_test", {
    value: "expires_and_max-age_test",
    expires: Time.now().plus(15552000 * 2),
    maxAge: 15552000,
    path: "/",
  });
  return response.finish();
});

it("has standard constructor", () => {
  const headers = { header: "value" };
  const body = ["body"];
  const response = new MockResponse(200, headers, body);
  expect(response.status).toBe(200);
  expect(response.headers).toEqual(headers);
  expect(response.body).toBe(body.join(""));
});

it("provides access to the HTTP status", async () => {
  let res = await new MockRequest(app).get("");
  expect(res.isSuccessful).toBeTruthy();
  expect(res.isOk).toBeTruthy();
  res = await new MockRequest(app).get("/?status=404");
  expect(res.isSuccessful).toBeFalsy();
  expect(res.isClientError).toBeTruthy();
  expect(res.isNotFound).toBeTruthy();
  res = await new MockRequest(app).get("/?status=501");
  expect(res.isSuccessful).toBeFalsy();
  expect(res.isServerError).toBeTruthy();
  res = await new MockRequest(app).get("/?status=307");
  expect(res.isRedirect).toBeTruthy();
  res = await new MockRequest(app).get("/?status=201", { ":lint": true });
  expect(res.isEmpty()).toBeTruthy();
});

it("provides access to the HTTP headers", async () => {
  const res = await new MockRequest(app).get("");
  expect(Object.keys(res.headers)).toContain("content-type");
  expect(res.headers["content-type"]).toBe("text/yaml");
  expect(res.originalHeaders["content-type"]).toBe("text/yaml");
  expect(res.get("content-type")).toBe("text/yaml");
  expect(res.contentType).toBe("text/yaml");
  expect(res.contentLength).not.toEqual(0);
  expect(res.location).toBeUndefined();
});

it("provides access to session cookies", async () => {
  const res = await new MockRequest(app).get("");
  const sessionCookie = res.cookie("session_test")!;
  expect(sessionCookie.value[0]).toBe("session_test");
  expect(sessionCookie.domain).toBe("test.com");
  expect(sessionCookie.path).toBe("/");
  expect(sessionCookie.secure).toBe(false);
  expect(sessionCookie.expires).toBeNull();
});

it("provides access to persistent cookies set with max-age", async () => {
  const res = await new MockRequest(app).get("");
  const persistentCookie = res.cookie("persistent_test")!;
  expect(persistentCookie.value[0]).toBe("persistent_test");
  expect(persistentCookie.domain).toBeNull();
  expect(persistentCookie.path).toBe("/");
  expect(persistentCookie.secure).toBe(false);
  expect(persistentCookie.expires).not.toBeNull();
  expect((persistentCookie.expires as Time).compare(Time.now().plus(15552000))).toBeLessThan(0);
});

it("provides access to persistent cookies set with expires", async () => {
  const res = await new MockRequest(app).get("");
  const persistentCookie = res.cookie("persistent_with_expires_test")!;
  expect(persistentCookie.value[0]).toBe("persistent_with_expires_test");
  expect(persistentCookie.domain).toBeNull();
  expect(persistentCookie.path).toBe("/");
  expect(persistentCookie.secure).toBe(false);
  expect(persistentCookie.expires).not.toBeNull();
  expect(persistentCookie.expires).toEqual(Time.httpdate("Thu, 31 Oct 2021 07:28:00 GMT"));
});

it("parses cookies giving max-age precedence over expires", async () => {
  const res = await new MockRequest(app).get("");
  const persistentCookie = res.cookie("expires_and_max-age_test")!;
  expect(persistentCookie.value[0]).toBe("expires_and_max-age_test");
  expect(persistentCookie.expires).not.toBeNull();
  expect((persistentCookie.expires as Time).compare(Time.now().plus(15552000))).toBeLessThan(0);
});

it("provides access to secure cookies", async () => {
  const res = await new MockRequest(app).get("");
  const secureCookie = res.cookie("secure_test")!;
  expect(secureCookie.value[0]).toBe("secure_test");
  expect(secureCookie.domain).toBe("test.com");
  expect(secureCookie.path).toBe("/");
  expect(secureCookie.secure).toBe(true);
  expect(secureCookie.expires).toBeNull();
});

it("parses cookie headers with equals sign at the end", async () => {
  const res = await new MockRequest(() => [
    200,
    { "Set-Cookie": "__cf_bm=_somebase64encodedstringwithequalsatthened=; array=awesome" },
    [""],
  ]).get("");
  const cookie = res.cookie("__cf_bm")!;
  expect(cookie.value[0]).toBe("_somebase64encodedstringwithequalsatthened=");
});

it("returns nil if a non existent cookie is requested", async () => {
  const res = await new MockRequest(app).get("");
  expect(res.cookie("i_dont_exist")).toBeNull();
});

it("handles an empty cookie", async () => {
  const res = await new MockRequest(() => [200, { "Set-Cookie": "" }, [""]]).get("");
  expect(res.cookie("i_dont_exist")).toBeNull();
});

it("parses multiple set-cookie headers provided as hash with array value", async () => {
  const cookieHeaders = { "set-cookie": ["array=awesome", "multiple=times"] };
  const res = await new MockRequest(() => [200, cookieHeaders, [""]]).get("");
  const arrayCookie = res.cookie("array")!;
  expect(arrayCookie.value[0]).toBe("awesome");
  const secondCookie = res.cookie("multiple")!;
  expect(secondCookie.value[0]).toBe("times");
});

it("provides access to the HTTP body", async () => {
  const res = await new MockRequest(app).get("");
  expect(res.body).toMatch(/rack/);
  expect(res.body).toMatch(/rack/);
  expect(res.match(/rack/)![0]).toBe("rack");
  expect(res.match(/banana/)).toBeNull();
});

it("provides access to the Rack errors", async () => {
  const res = await new MockRequest(app).get("/?error=foo", { ":lint": true });
  expect(res.isOk).toBeTruthy();
  expect(res.errors!.length === 0).toBeFalsy();
  expect(res.errors).toContain("foo");
});

it("allows calling body.close afterwards", () => {
  const body = new StringIO("hi");
  const res = new MockResponse(200, {}, body);
  body.close();
  expect(res.body).toBe("hi");
});

it("ignores plain strings passed as errors", () => {
  expect(new MockResponse(200, {}, [], "e").errors).toBeNull();
});

it("optionally makes Rack errors fatal", async () => {
  await expect(new MockRequest(app).get("/?error=foo", { ":fatal": true })).rejects.toThrow(
    FatalWarning,
  );
  const res = new MockRequest((env) => env["rack.errors"].write(env["rack.errors"].string())).get(
    "/",
    { ":fatal": true },
  );
  await expect(res).rejects.toThrow(FatalWarning);
  expect((await res.catch((e) => e)).message).toBe("");
});

class ChunkedBody {
  static TERM = "\r\n";
  static TAIL = `0${ChunkedBody.TERM}`;
  private body: string[];
  constructor(body: string[]) {
    this.body = body;
  }
  each(block: (chunk: string) => void): void {
    const term = ChunkedBody.TERM;
    for (const chunk of this.body) {
      const size = chunk.length;
      if (size === 0) continue;
      block([size.toString(16), term, chunk, term].join(""));
    }
    block(ChunkedBody.TAIL);
    block(term);
  }
  close(): void {}
}

it("does not calculate content length for streaming body", () => {
  const body = new ChunkedBody(["a".repeat(96)]);
  const res = new MockResponse(200, { "transfer-encoding": "chunked" }, body).toA();
  const headers = res[1];
  expect(Object.hasOwn(headers, "content-length")).toBeFalsy();
});

describe("headers", () => {
  let res: MockResponse;

  beforeEach(async () => {
    res = await new MockRequest(app).get("");
    res.setHeader("FOO", "1");
  });

  it("has_header?", () => {
    expect(() => res.hasHeader(null as any)).toThrow(ArgumentError);
    expect(res.hasHeader("FOO")).toBe(true);
    expect(res.hasHeader("Foo")).toBe(true);
  });

  it("get_header", () => {
    expect(() => res.getHeader(null as any)).toThrow(ArgumentError);
    expect(res.getHeader("FOO")).toBe("1");
    expect(res.getHeader("Foo")).toBe("1");
  });

  it("set_header", () => {
    expect(() => res.setHeader(null as any, "1")).toThrow(ArgumentError);
    expect(res.setHeader("FOO", "2")).toBe("2");
    expect(res.getHeader("FOO")).toBe("2");
    expect(res.setHeader("Foo", "3")).toBe("3");
    expect(res.getHeader("Foo")).toBe("3");
    expect(res.getHeader("FOO")).toBe("3");
    expect(res.setHeader("FOO", null)).toBeNull();
    expect(res.getHeader("FOO")).toBeNull();
    expect(res.hasHeader("FOO")).toBe(true);
  });

  it("add_header", () => {
    expect(() => res.addHeader(null as any, "1")).toThrow(ArgumentError);
    expect(res.addHeader("FOO", "1")).toEqual(["1", "1"]);
    expect(res.getHeader("FOO")).toEqual(["1", "1"]);
    expect(res.addHeader("FOO", null)).toEqual(["1", "1"]);
    expect(res.getHeader("FOO")).toEqual(["1", "1"]);
    expect(res.addHeader("FOO", 2 as any)).toEqual(["1", "1", "2"]);
    expect(res.getHeader("FOO")).toEqual(["1", "1", "2"]);
    expect(res.addHeader("Foo", "yep")).toEqual(["1", "1", "2", "yep"]);
    expect(res.getHeader("Foo")).toEqual(["1", "1", "2", "yep"]);
    expect(res.getHeader("FOO")).toEqual(["1", "1", "2", "yep"]);
  });

  it("delete_header", () => {
    expect(() => res.deleteHeader(null as any)).toThrow(ArgumentError);
    expect(res.deleteHeader("FOO")).toBe("1");
    expect(res.hasHeader("FOO")).toBe(false);
    expect(res.hasHeader("Foo")).toBe(false);
    expect(res.deleteHeader("Foo")).toBeNull();
  });

  it("does not add extra headers", async () => {
    const enumerableApp = () => [200, {}, [""][Symbol.iterator]()] as any;
    const response = await new MockRequest(enumerableApp).get("/");
    expect(response.status).toBe(200);
    expect(response.headers).toEqual({});
    expect(response.body).toBe("");
  });
});
