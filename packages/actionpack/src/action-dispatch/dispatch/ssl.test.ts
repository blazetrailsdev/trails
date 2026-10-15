import { beforeEach, describe, it } from "vitest";
import { Lint, SET_COOKIE } from "@blazetrails/rack";
import type { RackEnv } from "@blazetrails/rack";
import { assertEqual, assertNil, years } from "@blazetrails/activesupport";
import { SSL, type SSLOptions } from "../middleware/ssl.js";
import type { Request } from "../http/request.js";
import { STRICT_TRANSPORT_SECURITY } from "../constants.js";
import { IntegrationTest } from "../testing/integration.js";
import "../../test-helpers/abstract-unit.js";

function buildApp({
  headers = {},
  sslOptions = {},
}: { headers?: Record<string, unknown>; sslOptions?: SSLOptions } = {}): Lint {
  const app = (_env: RackEnv): [number, Record<string, unknown>, unknown[]] => [200, headers, []];
  return new Lint(new SSL(new Lint(app), { hsts: { subdomains: true }, ...sslOptions }));
}

describe("RedirectSSLTest", () => {
  let testCase: IntegrationTest;

  beforeEach(({ task }) => {
    testCase = new IntegrationTest(task.name);
  });

  async function assertNotRedirected(
    url: string,
    {
      headers = {},
      redirect = {},
    }: { headers?: Record<string, unknown>; redirect?: SSLOptions["redirect"] } = {},
  ): Promise<void> {
    testCase.app = buildApp({ sslOptions: { redirect } });
    await testCase.get(url, { headers });
    testCase.assertResponse("ok");
  }

  async function assertRedirected({
    redirect = {},
    from = "http://a/b?c=d",
    to = from.replace("http", "https"),
  }: { redirect?: Record<string, unknown>; from?: string; to?: string } = {}): Promise<void> {
    redirect = { body: [], ...redirect };

    testCase.app = buildApp({ sslOptions: { redirect } });

    await testCase.get(from);
    testCase.assertResponse((redirect.status as number | undefined) ?? 301);
    testCase.assertRedirectedTo(to);
    assertEqual((redirect.body as string[]).join(""), testCase.response.body);
  }

  async function assertPostRedirected({
    redirect = {},
    from = "http://a/b?c=d",
    to = from.replace("http", "https"),
  }: { redirect?: Record<string, unknown>; from?: string; to?: string } = {}): Promise<void> {
    testCase.app = buildApp({ sslOptions: { redirect } });

    await testCase.post(from);
    testCase.assertResponse((redirect.status as number | undefined) ?? 307);
    testCase.assertRedirectedTo(to);
  }

  it("exclude can avoid redirect", async () => {
    const excluding = { exclude: (request: Request) => /healthcheck/.test(request.path) };

    await assertNotRedirected("http://example.org/healthcheck", { redirect: excluding });
    await assertRedirected({ from: "http://example.org/", redirect: excluding });
  });

  it("https is not redirected", async () => {
    await assertNotRedirected("https://example.org");
  });

  it("proxied https is not redirected", async () => {
    await assertNotRedirected("http://example.org", {
      headers: { HTTP_X_FORWARDED_PROTO: "https" },
    });
  });

  it("http is redirected to https", async () => {
    await assertRedirected();
  });

  it("http POST is redirected to https with status 307", async () => {
    await assertPostRedirected();
  });

  it("redirect with custom status", async () => {
    await assertRedirected({ redirect: { status: 308 } });
  });

  it("redirect with unknown request method", async () => {
    testCase.app = buildApp();

    await testCase.process("not_an_http_method", "http://a/b?c=d");

    testCase.assertResponse(307);
    testCase.assertRedirectedTo("https://a/b?c=d");
  });

  it("redirect with ssl_default_redirect_status", async () => {
    testCase.app = buildApp({ sslOptions: { sslDefaultRedirectStatus: 308 } });

    await testCase.get("http://a/b?c=d");

    testCase.assertResponse(301);
    testCase.assertRedirectedTo("https://a/b?c=d");

    await testCase.post("http://a/b?c=d");

    testCase.assertResponse(308);
    testCase.assertRedirectedTo("https://a/b?c=d");
  });

  it("redirect with custom body", async () => {
    await assertRedirected({ redirect: { body: ["foo"] } });
  });

  it("redirect to specific host", async () => {
    await assertRedirected({ redirect: { host: "ssl" }, to: "https://ssl/b?c=d" });
  });

  it("redirect to default port", async () => {
    await assertRedirected({ redirect: { port: 443 } });
  });

  it("redirect to non-default port", async () => {
    await assertRedirected({ redirect: { port: 8443 }, to: "https://a:8443/b?c=d" });
  });

  it("redirect to different host and non-default port", async () => {
    await assertRedirected({
      redirect: { host: "ssl", port: 8443 },
      to: "https://ssl:8443/b?c=d",
    });
  });

  it("redirect to different host including port", async () => {
    await assertRedirected({ redirect: { host: "ssl:443" }, to: "https://ssl:443/b?c=d" });
  });

  it("no redirect with redirect set to false", async () => {
    await assertNotRedirected("http://example.org", { redirect: false });
  });
});

const EXPECTED = "max-age=63072000";
const EXPECTED_WITH_SUBDOMAINS = "max-age=63072000; includeSubDomains";

describe("StrictTransportSecurityTest", () => {
  let testCase: IntegrationTest;

  beforeEach(({ task }) => {
    testCase = new IntegrationTest(task.name);
  });

  async function assertHsts(
    expected: string | null,
    {
      url = "https://example.org",
      hsts = { subdomains: true },
      headers = {},
    }: { url?: string; hsts?: SSLOptions["hsts"]; headers?: Record<string, unknown> } = {},
  ): Promise<void> {
    testCase.app = buildApp({ sslOptions: { hsts }, headers });
    await testCase.get(url);
    if (expected == null) {
      assertNil(testCase.response.headers.get("strict-transport-security"));
    } else {
      assertEqual(expected, testCase.response.headers.get("strict-transport-security"));
    }
  }

  it("enabled by default", async () => {
    await assertHsts(EXPECTED_WITH_SUBDOMAINS);
  });

  it("not sent with http:// responses", async () => {
    await assertHsts(null, { url: "http://example.org" });
  });

  it("defers to app-provided header", async () => {
    const headers = { [STRICT_TRANSPORT_SECURITY]: "app-provided" };
    await assertHsts("app-provided", { headers });
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

  it(":expires supports AS::Duration arguments", async () => {
    await assertHsts("max-age=31556952; includeSubDomains", { hsts: { expires: years(1) } });
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

const DEFAULT = ["id=1; path=/", "token=abc; path=/; secure; HttpOnly"];

describe("SecureCookiesTest", () => {
  let testCase: IntegrationTest;

  beforeEach(({ task }) => {
    testCase = new IntegrationTest(task.name);
  });

  async function get(
    options: { headers?: Record<string, unknown>; sslOptions?: SSLOptions } = {},
  ): Promise<void> {
    testCase.app = buildApp(options);
    await testCase.get("https://example.org");
  }

  function assertCookies(...expected: string[]): void {
    const cookies = testCase.response.headers.get(SET_COOKIE);
    assertEqual(expected, cookies);
  }

  it("flag cookies as secure", async () => {
    await get({ headers: { [SET_COOKIE]: DEFAULT } });
    assertCookies("id=1; path=/; secure", "token=abc; path=/; secure; HttpOnly");
  });

  it("flag cookies as secure at end of line", async () => {
    await get({ headers: { [SET_COOKIE]: "problem=def; path=/; HttpOnly; secure" } });
    assertCookies("problem=def; path=/; HttpOnly; secure");
  });

  it("flag cookies as secure with more spaces before", async () => {
    await get({ headers: { [SET_COOKIE]: "problem=def; path=/; HttpOnly;  secure" } });
    assertCookies("problem=def; path=/; HttpOnly;  secure");
  });

  it("flag cookies as secure with more spaces after", async () => {
    await get({ headers: { [SET_COOKIE]: "problem=def; path=/; secure;  HttpOnly" } });
    assertCookies("problem=def; path=/; secure;  HttpOnly");
  });

  it("flag cookies as secure with has not spaces before", async () => {
    await get({ headers: { [SET_COOKIE]: "problem=def; path=/;secure; HttpOnly" } });
    assertCookies("problem=def; path=/;secure; HttpOnly");
  });

  it("flag cookies as secure with has not spaces after", async () => {
    await get({ headers: { [SET_COOKIE]: "problem=def; path=/; secure;HttpOnly" } });
    assertCookies("problem=def; path=/; secure;HttpOnly");
  });

  it("flag cookies as secure with ignore case", async () => {
    await get({ headers: { [SET_COOKIE]: "problem=def; path=/; Secure; HttpOnly" } });
    assertCookies("problem=def; path=/; Secure; HttpOnly");
  });

  it("cookies as not secure with secure cookies disabled", async () => {
    await get({ headers: { [SET_COOKIE]: DEFAULT }, sslOptions: { secureCookies: false } });
    assertCookies("id=1; path=/", "token=abc; path=/; secure; HttpOnly");
  });

  it("cookies as not secure with exclude", async () => {
    const excluding = { exclude: (request: Request) => /example/.test(request.domain() ?? "") };
    await get({ headers: { [SET_COOKIE]: DEFAULT }, sslOptions: { redirect: excluding } });

    assertCookies("id=1; path=/", "token=abc; path=/; secure; HttpOnly");
    testCase.assertResponse("ok");
  });

  it("no cookies", async () => {
    await get();
    assertNil(testCase.response.headers.get(SET_COOKIE));
  });

  it("keeps original headers behavior", async () => {
    await get({ headers: { connection: "close" } });
    assertEqual("close", testCase.response.headers.get("connection"));
  });

  it("flag cookies as secure with single cookie in array", async () => {
    await get({ headers: { [SET_COOKIE]: ["id=1"] } });
    assertCookies("id=1; secure");
  });

  it("flag cookies as secure with multiple cookies in array", async () => {
    await get({ headers: { [SET_COOKIE]: ["id=1", "problem=def"] } });
    assertCookies("id=1; secure", "problem=def; secure");
  });
});
