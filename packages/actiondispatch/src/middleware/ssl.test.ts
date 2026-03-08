import { describe, it, expect } from "vitest";
import { SSL } from "./ssl.js";
import type { RackEnv, RackResponse } from "@rails-ts/rack";
import { bodyFromString, bodyToString } from "@rails-ts/rack";

const okApp = async (_env: RackEnv): Promise<RackResponse> => [
  200,
  { "content-type": "text/plain" },
  bodyFromString("OK"),
];

const cookieApp = async (_env: RackEnv): Promise<RackResponse> => [
  200,
  { "content-type": "text/plain", "set-cookie": "session=abc; path=/" },
  bodyFromString("OK"),
];

describe("ActionDispatch::SSL", () => {
  it("redirects HTTP to HTTPS", async () => {
    const ssl = new SSL(okApp);
    const [status, headers] = await ssl.call({
      "rack.url_scheme": "http",
      HTTP_HOST: "example.com",
      PATH_INFO: "/posts",
      REQUEST_METHOD: "GET",
    });
    expect(status).toBe(301);
    expect(headers.location).toBe("https://example.com/posts");
  });

  it("does not redirect HTTPS", async () => {
    const ssl = new SSL(okApp);
    const [status] = await ssl.call({
      "rack.url_scheme": "https",
      HTTP_HOST: "example.com",
      PATH_INFO: "/",
      REQUEST_METHOD: "GET",
    });
    expect(status).toBe(200);
  });

  it("redirect preserves query string", async () => {
    const ssl = new SSL(okApp);
    const [_, headers] = await ssl.call({
      "rack.url_scheme": "http",
      HTTP_HOST: "example.com",
      PATH_INFO: "/search",
      QUERY_STRING: "q=hello",
      REQUEST_METHOD: "GET",
    });
    expect(headers.location).toBe("https://example.com/search?q=hello");
  });

  it("redirect with custom status", async () => {
    const ssl = new SSL(okApp, { redirect: { status: 307 } });
    const [status] = await ssl.call({
      "rack.url_scheme": "http",
      HTTP_HOST: "example.com",
      PATH_INFO: "/",
      REQUEST_METHOD: "GET",
    });
    expect(status).toBe(307);
  });

  it("redirect with custom port", async () => {
    const ssl = new SSL(okApp, { redirect: { port: 8443 } });
    const [_, headers] = await ssl.call({
      "rack.url_scheme": "http",
      HTTP_HOST: "example.com:8080",
      PATH_INFO: "/",
      REQUEST_METHOD: "GET",
    });
    expect(headers.location).toBe("https://example.com:8443/");
  });

  it("redirect disabled", async () => {
    const ssl = new SSL(okApp, { redirect: false });
    const [status] = await ssl.call({
      "rack.url_scheme": "http",
      HTTP_HOST: "example.com",
      PATH_INFO: "/",
      REQUEST_METHOD: "GET",
    });
    expect(status).toBe(200);
  });

  it("sets HSTS header on HTTPS", async () => {
    const ssl = new SSL(okApp);
    const [_, headers] = await ssl.call({
      "rack.url_scheme": "https",
      HTTP_HOST: "example.com",
      PATH_INFO: "/",
      REQUEST_METHOD: "GET",
    });
    expect(headers["strict-transport-security"]).toBe("max-age=31536000");
  });

  it("HSTS with subdomains", async () => {
    const ssl = new SSL(okApp, { hsts: { subdomains: true } });
    const [_, headers] = await ssl.call({
      "rack.url_scheme": "https",
      HTTP_HOST: "example.com",
      PATH_INFO: "/",
      REQUEST_METHOD: "GET",
    });
    expect(headers["strict-transport-security"]).toContain("includeSubDomains");
  });

  it("HSTS with preload", async () => {
    const ssl = new SSL(okApp, { hsts: { preload: true } });
    const [_, headers] = await ssl.call({
      "rack.url_scheme": "https",
      HTTP_HOST: "example.com",
      PATH_INFO: "/",
      REQUEST_METHOD: "GET",
    });
    expect(headers["strict-transport-security"]).toContain("preload");
  });

  it("HSTS with custom expires", async () => {
    const ssl = new SSL(okApp, { hsts: { expires: 3600 } });
    const [_, headers] = await ssl.call({
      "rack.url_scheme": "https",
      HTTP_HOST: "example.com",
      PATH_INFO: "/",
      REQUEST_METHOD: "GET",
    });
    expect(headers["strict-transport-security"]).toBe("max-age=3600");
  });

  it("HSTS disabled", async () => {
    const ssl = new SSL(okApp, { hsts: false });
    const [_, headers] = await ssl.call({
      "rack.url_scheme": "https",
      HTTP_HOST: "example.com",
      PATH_INFO: "/",
      REQUEST_METHOD: "GET",
    });
    expect(headers["strict-transport-security"]).toBeUndefined();
  });

  it("no HSTS on HTTP", async () => {
    const ssl = new SSL(okApp, { redirect: false });
    const [_, headers] = await ssl.call({
      "rack.url_scheme": "http",
      HTTP_HOST: "example.com",
      PATH_INFO: "/",
      REQUEST_METHOD: "GET",
    });
    expect(headers["strict-transport-security"]).toBeUndefined();
  });

  it("flags cookies as secure on HTTPS", async () => {
    const ssl = new SSL(cookieApp);
    const [_, headers] = await ssl.call({
      "rack.url_scheme": "https",
      HTTP_HOST: "example.com",
      PATH_INFO: "/",
      REQUEST_METHOD: "GET",
    });
    expect(headers["set-cookie"]).toContain("; secure");
  });

  it("does not flag cookies when secureCookies is false", async () => {
    const ssl = new SSL(cookieApp, { secureCookies: false });
    const [_, headers] = await ssl.call({
      "rack.url_scheme": "https",
      HTTP_HOST: "example.com",
      PATH_INFO: "/",
      REQUEST_METHOD: "GET",
    });
    expect(headers["set-cookie"]).not.toContain("; secure");
  });

  it("exclude callback bypasses SSL", async () => {
    const ssl = new SSL(okApp, {
      exclude: (env) => (env["PATH_INFO"] as string) === "/health",
    });
    const [status] = await ssl.call({
      "rack.url_scheme": "http",
      HTTP_HOST: "example.com",
      PATH_INFO: "/health",
      REQUEST_METHOD: "GET",
    });
    expect(status).toBe(200);
  });

  it("exclude does not bypass non-matching paths", async () => {
    const ssl = new SSL(okApp, {
      exclude: (env) => (env["PATH_INFO"] as string) === "/health",
    });
    const [status] = await ssl.call({
      "rack.url_scheme": "http",
      HTTP_HOST: "example.com",
      PATH_INFO: "/other",
      REQUEST_METHOD: "GET",
    });
    expect(status).toBe(301);
  });

  it("X-Forwarded-Proto https is treated as SSL", async () => {
    const ssl = new SSL(okApp);
    const [status, headers] = await ssl.call({
      "rack.url_scheme": "http",
      HTTP_X_FORWARDED_PROTO: "https",
      HTTP_HOST: "example.com",
      PATH_INFO: "/",
      REQUEST_METHOD: "GET",
    });
    expect(status).toBe(200);
    expect(headers["strict-transport-security"]).toBeDefined();
  });

  it("redirect strips port from host", async () => {
    const ssl = new SSL(okApp);
    const [_, headers] = await ssl.call({
      "rack.url_scheme": "http",
      HTTP_HOST: "example.com:3000",
      PATH_INFO: "/",
      REQUEST_METHOD: "GET",
    });
    expect(headers.location).toBe("https://example.com/");
  });

  it("full HSTS with all options", async () => {
    const ssl = new SSL(okApp, {
      hsts: { expires: 63072000, subdomains: true, preload: true },
    });
    const [_, headers] = await ssl.call({
      "rack.url_scheme": "https",
      HTTP_HOST: "example.com",
      PATH_INFO: "/",
      REQUEST_METHOD: "GET",
    });
    expect(headers["strict-transport-security"]).toBe(
      "max-age=63072000; includeSubDomains; preload"
    );
  });
});
