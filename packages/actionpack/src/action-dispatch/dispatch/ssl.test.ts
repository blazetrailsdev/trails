/**
 * Rails design rationale: ActionDispatch::SSL is a Rack middleware that
 * enforces HTTPS at the edge. It operates on raw Rack env/response tuples
 * and needs no routing or controller infrastructure. The three test classes
 * mirror Rails' own grouping — redirect behavior, HSTS header generation,
 * and secure-cookie flagging — each exercised by instantiating SSL directly
 * with an inline inner app, which is idiomatic for middleware-level tests.
 */

import { describe, it, expect } from "vitest";
import { SSL, type SSLOptions } from "../middleware/ssl.js";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { bodyFromString } from "@blazetrails/rack";

type App = (env: RackEnv) => Promise<RackResponse>;

function buildApp(responseHeaders: Record<string, string> = {}, sslOptions: SSLOptions = {}): SSL {
  const inner: App = async (_env) => [200, { ...responseHeaders }, bodyFromString("")];
  return new SSL(inner, { hsts: { subdomains: true }, ...sslOptions });
}

function makeEnv(url: string, method = "GET", extra: Record<string, string> = {}): RackEnv {
  const u = new URL(url);
  return {
    "rack.url_scheme": u.protocol.replace(":", ""),
    HTTP_HOST: u.host,
    PATH_INFO: u.pathname,
    QUERY_STRING: u.search.replace(/^\?/, ""),
    REQUEST_METHOD: method,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// RedirectSSLTest
// ---------------------------------------------------------------------------

describe("RedirectSSLTest", () => {
  it("exclude can avoid redirect", async () => {
    const excluding = {
      exclude: (env: RackEnv) => /healthcheck/.test(env["PATH_INFO"] as string),
    };
    const app = buildApp({}, { redirect: excluding });

    const [s1] = await app.call(makeEnv("http://example.org/healthcheck"));
    expect(s1).toBe(200);

    const [s2, h2] = await app.call(makeEnv("http://example.org/"));
    expect(s2).toBe(301);
    expect(h2.location).toBe("https://example.org/");
  });

  it("https is not redirected", async () => {
    const [status] = await buildApp().call(makeEnv("https://example.org"));
    expect(status).toBe(200);
  });

  it("proxied https is not redirected", async () => {
    const [status] = await buildApp().call(
      makeEnv("http://example.org", "GET", { HTTP_X_FORWARDED_PROTO: "https" }),
    );
    expect(status).toBe(200);
  });

  it("http is redirected to https", async () => {
    const [status, headers] = await buildApp({}, { redirect: {} }).call(makeEnv("http://a/b?c=d"));
    expect(status).toBe(301);
    expect(headers.location).toBe("https://a/b?c=d");
  });

  it("http POST is redirected to https with status 307", async () => {
    const [status, headers] = await buildApp({}, { redirect: {} }).call(
      makeEnv("http://a/b?c=d", "POST"),
    );
    expect(status).toBe(307);
    expect(headers.location).toBe("https://a/b?c=d");
  });

  it("redirect with custom status", async () => {
    const [status] = await buildApp({}, { redirect: { status: 308 } }).call(
      makeEnv("http://a/b?c=d"),
    );
    expect(status).toBe(308);
  });

  it("redirect with unknown request method", async () => {
    const [status, headers] = await buildApp().call(
      makeEnv("http://a/b?c=d", "NOT_AN_HTTP_METHOD"),
    );
    expect(status).toBe(307);
    expect(headers.location).toBe("https://a/b?c=d");
  });

  it("redirect with ssl_default_redirect_status", async () => {
    const app = buildApp({}, { sslDefaultRedirectStatus: 308 });

    const [s1] = await app.call(makeEnv("http://a/b?c=d", "GET"));
    expect(s1).toBe(301);

    const [s2] = await app.call(makeEnv("http://a/b?c=d", "POST"));
    expect(s2).toBe(308);
  });

  it("redirect with custom body", async () => {
    const [, , body] = await buildApp({}, { redirect: { body: ["foo"] } }).call(
      makeEnv("http://a/b?c=d"),
    );
    const chunks: string[] = [];
    for await (const chunk of body) chunks.push(chunk.toString());
    expect(chunks.join("")).toBe("foo");
  });

  it("redirect to specific host", async () => {
    const [, headers] = await buildApp({}, { redirect: { host: "ssl" } }).call(
      makeEnv("http://a/b?c=d"),
    );
    expect(headers.location).toBe("https://ssl/b?c=d");
  });

  it("redirect to default port", async () => {
    const [, headers] = await buildApp({}, { redirect: { port: 443 } }).call(
      makeEnv("http://a/b?c=d"),
    );
    expect(headers.location).toBe("https://a/b?c=d");
  });

  it("redirect to non-default port", async () => {
    const [, headers] = await buildApp({}, { redirect: { port: 8443 } }).call(
      makeEnv("http://a/b?c=d"),
    );
    expect(headers.location).toBe("https://a:8443/b?c=d");
  });

  it("redirect to different host and non-default port", async () => {
    const [, headers] = await buildApp({}, { redirect: { host: "ssl", port: 8443 } }).call(
      makeEnv("http://a/b?c=d"),
    );
    expect(headers.location).toBe("https://ssl:8443/b?c=d");
  });

  it("redirect to different host including port", async () => {
    const [, headers] = await buildApp({}, { redirect: { host: "ssl:443" } }).call(
      makeEnv("http://a/b?c=d"),
    );
    expect(headers.location).toBe("https://ssl:443/b?c=d");
  });

  it("no redirect with redirect set to false", async () => {
    const [status] = await buildApp({}, { redirect: false }).call(makeEnv("http://example.org"));
    expect(status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// StrictTransportSecurityTest
// ---------------------------------------------------------------------------

const EXPECTED = "max-age=63072000";
const EXPECTED_WITH_SUBDOMAINS = "max-age=63072000; includeSubDomains";

describe("StrictTransportSecurityTest", () => {
  async function assertHsts(
    expected: string | null,
    {
      url = "https://example.org",
      hsts,
      headers = {},
    }: {
      url?: string;
      hsts?: SSLOptions["hsts"];
      headers?: Record<string, string>;
    } = {},
  ) {
    const sslOpts = hsts !== undefined ? { hsts } : { hsts: { subdomains: true } as const };
    const app = buildApp(headers, sslOpts);
    const [, resHeaders] = await app.call(makeEnv(url));
    if (expected === null) {
      expect(resHeaders["strict-transport-security"]).toBeUndefined();
    } else {
      expect(resHeaders["strict-transport-security"]).toBe(expected);
    }
  }

  it("enabled by default", async () => {
    await assertHsts(EXPECTED_WITH_SUBDOMAINS);
  });

  it("not sent with http:// responses", async () => {
    await assertHsts(null, { url: "http://example.org" });
  });

  it("defers to app-provided header", async () => {
    await assertHsts("app-provided", {
      headers: { "strict-transport-security": "app-provided" },
    });
  });

  it("hsts: true enables default settings", async () => {
    await assertHsts(EXPECTED_WITH_SUBDOMAINS, { hsts: true });
  });

  it("hsts: false sets max-age to zero, clearing browser HSTS settings", async () => {
    await assertHsts("max-age=0; includeSubDomains", { hsts: false });
  });

  it(":expires sets max-age", async () => {
    await assertHsts("max-age=500; includeSubDomains", { hsts: { expires: 500 } });
  });

  it.skip(":expires supports AS::Duration arguments", () => {
    // pending: ActiveSupport::Duration not ported; use plain seconds (31556952) instead
  });

  it("include subdomains", async () => {
    await assertHsts(`${EXPECTED}; includeSubDomains`, { hsts: { subdomains: true } });
  });

  it("exclude subdomains", async () => {
    await assertHsts(EXPECTED, { hsts: { subdomains: false } });
  });

  it("opt in to browser preload lists", async () => {
    await assertHsts(`${EXPECTED_WITH_SUBDOMAINS}; preload`, { hsts: { preload: true } });
  });

  it("opt out of browser preload lists", async () => {
    await assertHsts(EXPECTED_WITH_SUBDOMAINS, { hsts: { preload: false } });
  });
});

// ---------------------------------------------------------------------------
// SecureCookiesTest
// ---------------------------------------------------------------------------

// Rack 2 newline-joined format (our current implementation)
const DEFAULT_COOKIES = "id=1; path=/\ntoken=abc; path=/; secure; HttpOnly";

describe("SecureCookiesTest", () => {
  async function get(responseHeaders: Record<string, string> = {}, sslOptions: SSLOptions = {}) {
    const app = buildApp(responseHeaders, sslOptions);
    return app.call(makeEnv("https://example.org"));
  }

  function assertCookies(setCookie: string | undefined, ...expected: string[]) {
    const actual = (setCookie ?? "").split("\n");
    expect(actual).toEqual(expected);
  }

  it("flag cookies as secure", async () => {
    const [, headers] = await get({ "set-cookie": DEFAULT_COOKIES });
    assertCookies(
      headers["set-cookie"],
      "id=1; path=/; secure",
      "token=abc; path=/; secure; HttpOnly",
    );
  });

  it("flag cookies as secure at end of line", async () => {
    const [, headers] = await get({ "set-cookie": "problem=def; path=/; HttpOnly; secure" });
    assertCookies(headers["set-cookie"], "problem=def; path=/; HttpOnly; secure");
  });

  it("flag cookies as secure with more spaces before", async () => {
    const [, headers] = await get({ "set-cookie": "problem=def; path=/; HttpOnly;  secure" });
    assertCookies(headers["set-cookie"], "problem=def; path=/; HttpOnly;  secure");
  });

  it("flag cookies as secure with more spaces after", async () => {
    const [, headers] = await get({ "set-cookie": "problem=def; path=/; secure;  HttpOnly" });
    assertCookies(headers["set-cookie"], "problem=def; path=/; secure;  HttpOnly");
  });

  it("flag cookies as secure with has not spaces before", async () => {
    const [, headers] = await get({ "set-cookie": "problem=def; path=/;secure; HttpOnly" });
    assertCookies(headers["set-cookie"], "problem=def; path=/;secure; HttpOnly");
  });

  it("flag cookies as secure with has not spaces after", async () => {
    const [, headers] = await get({ "set-cookie": "problem=def; path=/; secure;HttpOnly" });
    assertCookies(headers["set-cookie"], "problem=def; path=/; secure;HttpOnly");
  });

  it("flag cookies as secure with ignore case", async () => {
    const [, headers] = await get({ "set-cookie": "problem=def; path=/; Secure; HttpOnly" });
    assertCookies(headers["set-cookie"], "problem=def; path=/; Secure; HttpOnly");
  });

  it("cookies as not secure with secure cookies disabled", async () => {
    const [, headers] = await get({ "set-cookie": DEFAULT_COOKIES }, { secureCookies: false });
    assertCookies(headers["set-cookie"], "id=1; path=/", "token=abc; path=/; secure; HttpOnly");
  });

  it("cookies as not secure with exclude", async () => {
    const excluding = {
      exclude: (env: RackEnv) => /example/.test(env["HTTP_HOST"] as string),
    };
    const [status, headers] = await get({ "set-cookie": DEFAULT_COOKIES }, { redirect: excluding });
    assertCookies(headers["set-cookie"], "id=1; path=/", "token=abc; path=/; secure; HttpOnly");
    expect(status).toBe(200);
  });

  it("no cookies", async () => {
    const [, headers] = await get();
    expect(headers["set-cookie"]).toBeUndefined();
  });

  it("keeps original headers behavior", async () => {
    const [, headers] = await get({ connection: "close" });
    expect(headers.connection).toBe("close");
  });

  it.skip("flag cookies as secure with single cookie in array", () => {
    // pending: array-based set-cookie headers require Rack 3 semantics not yet ported
  });

  it.skip("flag cookies as secure with multiple cookies in array", () => {
    // pending: array-based set-cookie headers require Rack 3 semantics not yet ported
  });
});
