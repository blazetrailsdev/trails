import { beforeEach, describe, it, expect } from "vitest";
import {
  HostAuthorization,
  ALLOWED_HOSTS_IN_DEVELOPMENT,
  type HostPermission,
} from "../middleware/host-authorization.js";
import { IPAddr, StringIO } from "@blazetrails/ruby-compat";
import { Logger, assertEmpty, assertEqual, assertMatch } from "@blazetrails/activesupport";
import { Base } from "@blazetrails/actionview";
import { Lint } from "@blazetrails/rack";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import type { Request } from "../http/request.js";
import { bodyFromString, bodyToString } from "@blazetrails/rack";
import { IntegrationTest } from "../testing/integration.js";
import "../../test-helpers/abstract-unit.js";

const okApp = async (_env: RackEnv): Promise<RackResponse> => [
  200,
  { "content-type": "text/plain" },
  bodyFromString("OK"),
];

describe("HostAuthorizationTest", () => {
  it("allows request when host matches exactly", async () => {
    const mw = new HostAuthorization(okApp, { hosts: ["example.com"] });
    const [status] = await mw.call({
      HTTP_HOST: "example.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(200);
  });

  it("blocks request when host does not match", async () => {
    const mw = new HostAuthorization(okApp, { hosts: ["example.com"] });
    const [status, headers, body] = await mw.call({
      HTTP_HOST: "evil.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(403);
    expect(headers["content-type"]).toContain("text/html");
    expect(await bodyToString(body)).toBe("");
  });

  it("default response renders DebugView body when show_detailed_exceptions is set", async () => {
    const mw = new HostAuthorization(okApp, { hosts: ["example.com"] });
    const [status, headers, body] = await mw.call({
      HTTP_HOST: "evil.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      "action_dispatch.show_detailed_exceptions": true,
    });
    expect(status).toBe(403);
    expect(headers["content-type"]).toContain("text/html");
    const rendered = await bodyToString(body);
    expect(rendered).toContain("Blocked host");
    expect(rendered).toContain("evil.com");
  });

  it("default response uses text/plain for XHR requests", async () => {
    const mw = new HostAuthorization(okApp, { hosts: ["example.com"] });
    const [status, headers] = await mw.call({
      HTTP_HOST: "evil.com",
      HTTP_X_REQUESTED_WITH: "XMLHttpRequest",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(403);
    expect(headers["content-type"]).toContain("text/plain");
  });

  it("default response logs blocked hosts via request logger", async () => {
    const messages: string[] = [];
    const logger = { error: (msg: string) => messages.push(msg) };
    const mw = new HostAuthorization(okApp, { hosts: ["example.com"] });
    await mw.call({
      HTTP_HOST: "evil.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      "action_dispatch.logger": logger,
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("Blocked hosts: evil.com");
    expect(messages[0]).toContain("DefaultResponseApp");
  });

  it("allows wildcard subdomain matching", async () => {
    const mw = new HostAuthorization(okApp, { hosts: [".example.com"] });
    const [status] = await mw.call({
      HTTP_HOST: "app.example.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(200);
  });

  it("wildcard subdomain also matches apex domain", async () => {
    const mw = new HostAuthorization(okApp, { hosts: [".example.com"] });
    const [status] = await mw.call({
      HTTP_HOST: "example.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(200);
  });

  it("wildcard subdomain does not match different domain", async () => {
    const mw = new HostAuthorization(okApp, { hosts: [".example.com"] });
    const [status] = await mw.call({
      HTTP_HOST: "evil-example.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(403);
  });

  it("allows regexp matching", async () => {
    const mw = new HostAuthorization(okApp, { hosts: [/example\.(com|org)/] });
    const [s1] = await mw.call({ HTTP_HOST: "example.com", REQUEST_METHOD: "GET", PATH_INFO: "/" });
    expect(s1).toBe(200);
    const [s2] = await mw.call({ HTTP_HOST: "example.org", REQUEST_METHOD: "GET", PATH_INFO: "/" });
    expect(s2).toBe(200);
    const [s3] = await mw.call({ HTTP_HOST: "example.net", REQUEST_METHOD: "GET", PATH_INFO: "/" });
    expect(s3).toBe(403);
  });

  it("multiple allowed hosts", async () => {
    const mw = new HostAuthorization(okApp, { hosts: ["a.com", "b.com"] });
    const [s1] = await mw.call({ HTTP_HOST: "a.com", REQUEST_METHOD: "GET", PATH_INFO: "/" });
    expect(s1).toBe(200);
    const [s2] = await mw.call({ HTTP_HOST: "b.com", REQUEST_METHOD: "GET", PATH_INFO: "/" });
    expect(s2).toBe(200);
    const [s3] = await mw.call({ HTTP_HOST: "c.com", REQUEST_METHOD: "GET", PATH_INFO: "/" });
    expect(s3).toBe(403);
  });

  it("empty hosts list allows all", async () => {
    const mw = new HostAuthorization(okApp, { hosts: [] });
    const [status] = await mw.call({
      HTTP_HOST: "anything.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(200);
  });

  it("strips port from host before checking", async () => {
    const mw = new HostAuthorization(okApp, { hosts: ["example.com"] });
    const [status] = await mw.call({
      HTTP_HOST: "example.com:3000",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(200);
  });

  it("case insensitive host matching", async () => {
    const mw = new HostAuthorization(okApp, { hosts: ["example.com"] });
    const [status] = await mw.call({
      HTTP_HOST: "Example.COM",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(200);
  });

  it("exclude callback bypasses authorization", async () => {
    const mw = new HostAuthorization(okApp, {
      hosts: ["example.com"],
      exclude: (req) => req.path === "/health",
    });
    const [status] = await mw.call({
      HTTP_HOST: "evil.com",
      PATH_INFO: "/health",
      REQUEST_METHOD: "GET",
    });
    expect(status).toBe(200);
  });

  it("exclude does not bypass non-matching paths", async () => {
    const mw = new HostAuthorization(okApp, {
      hosts: ["example.com"],
      exclude: (req) => req.path === "/health",
    });
    const [status] = await mw.call({
      HTTP_HOST: "evil.com",
      PATH_INFO: "/other",
      REQUEST_METHOD: "GET",
    });
    expect(status).toBe(403);
  });

  it("custom response app", async () => {
    const customApp = async (_env: RackEnv): Promise<RackResponse> => [
      503,
      { "content-type": "text/plain" },
      bodyFromString("Service Unavailable"),
    ];
    const mw = new HostAuthorization(okApp, {
      hosts: ["example.com"],
      responseApp: customApp,
    });
    const [status, _, body] = await mw.call({
      HTTP_HOST: "evil.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(503);
    expect(await bodyToString(body)).toBe("Service Unavailable");
  });

  it("falls back to SERVER_NAME when HTTP_HOST is absent", async () => {
    const mw = new HostAuthorization(okApp, { hosts: ["example.com"] });
    const [status] = await mw.call({
      SERVER_NAME: "example.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(200);
  });

  it("IPv4 address matching", async () => {
    const mw = new HostAuthorization(okApp, { hosts: ["127.0.0.1"] });
    const [s1] = await mw.call({ HTTP_HOST: "127.0.0.1", REQUEST_METHOD: "GET", PATH_INFO: "/" });
    expect(s1).toBe(200);
    const [s2] = await mw.call({ HTTP_HOST: "192.168.1.1", REQUEST_METHOD: "GET", PATH_INFO: "/" });
    expect(s2).toBe(403);
  });

  it("IPv6 loopback matching", async () => {
    const mw = new HostAuthorization(okApp, { hosts: ["[::1]"] });
    const [status] = await mw.call({
      HTTP_HOST: "[::1]",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(200);
  });

  it("authorized_host preserves IPv6 brackets and strips port", async () => {
    const env: Record<string, unknown> = {
      HTTP_HOST: "[::1]:3000",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    };
    const mw = new HostAuthorization(okApp, { hosts: [new IPAddr("::/0")] });
    const [status] = await mw.call(env);
    expect(status).toBe(200);
    expect(env["action_dispatch.authorized_host"]).toBe("[::1]");
  });

  it("SUBDOMAIN_REGEX allows only a single subdomain segment", async () => {
    const mw = new HostAuthorization(okApp, { hosts: [".example.com"] });
    const [status] = await mw.call({
      HTTP_HOST: "deep.sub.example.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(403);
  });

  it("IPv4-mapped IPv6 host matches CIDR allowlist", async () => {
    const mw = new HostAuthorization(okApp, { hosts: [new IPAddr("::/0")] });
    const [status] = await mw.call({
      HTTP_HOST: "[::ffff:127.0.0.1]",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(200);
  });

  it("non-IP hostname does not match IPv6 CIDR allowlist", async () => {
    const mw = new HostAuthorization(okApp, { hosts: [new IPAddr("::/0")] });
    const [status] = await mw.call({
      HTTP_HOST: "example.com:3000",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(403);
  });
});

const App = (_env: RackEnv): RackResponse => [200, {}, ["Success"]] as unknown as RackResponse;

function buildApp(
  hosts: HostPermission | HostPermission[] | null,
  {
    exclude = undefined,
    responseApp = undefined,
    lint = true,
    app = App as unknown as RackApp,
  }: {
    exclude?: (req: Request) => boolean;
    responseApp?: (env: RackEnv) => RackResponse | Promise<RackResponse>;
    lint?: boolean;
    app?: RackApp;
  } = {},
): RackApp {
  if (lint) {
    app = new Lint(app) as unknown as RackApp;
  }

  app = new HostAuthorization(app, {
    hosts: hosts as HostPermission[],
    exclude,
    responseApp: responseApp as never,
  }) as unknown as RackApp;

  if (lint) {
    app = new Lint(app) as unknown as RackApp;
  }

  return app;
}

describe("HostAuthorizationTest", () => {
  let testCase: IntegrationTest;

  beforeEach(({ task }) => {
    testCase = new IntegrationTest(task.name);
  });

  it("blocks requests to unallowed host with empty body", async () => {
    testCase.app = buildApp(["only.com"]);

    await testCase.get("/");

    testCase.assertResponse("forbidden");
    assertEmpty(testCase.response.body);
  });

  it("renders debug info when all requests considered as local", async () => {
    testCase.app = buildApp(["only.com"]);

    await testCase.get("/", { env: { "action_dispatch.show_detailed_exceptions": true } });

    testCase.assertResponse("forbidden");
    assertMatch("Blocked hosts: www.example.com", testCase.response.body);
  });

  it("allows all requests if hosts is empty", async () => {
    testCase.app = buildApp(null);

    await testCase.get("/");

    testCase.assertResponse("ok");
    assertEqual("Success", testCase.body);
  });

  it("hosts can be a single element array", async () => {
    testCase.app = buildApp(["www.example.com"]);

    await testCase.get("/");

    testCase.assertResponse("ok");
    assertEqual("Success", testCase.body);
  });

  it("hosts can be a string", async () => {
    testCase.app = buildApp("www.example.com");

    await testCase.get("/");

    testCase.assertResponse("ok");
    assertEqual("Success", testCase.body);
  });

  it("hosts are matched case insensitive", async () => {
    testCase.app = buildApp("Example.local");

    await testCase.get("/", {
      env: {
        HOST: "example.local",
      },
    });

    testCase.assertResponse("ok");
    assertEqual("Success", testCase.body);
  });

  it("hosts are matched case insensitive with titlecased host", async () => {
    testCase.app = buildApp("example.local");

    await testCase.get("/", {
      env: {
        HOST: "Example.local",
      },
    });

    testCase.assertResponse("ok");
    assertEqual("Success", testCase.body);
  });

  it("hosts are matched case insensitive with hosts array", async () => {
    testCase.app = buildApp(["Example.local"]);

    await testCase.get("/", {
      env: {
        HOST: "example.local",
      },
    });

    testCase.assertResponse("ok");
    assertEqual("Success", testCase.body);
  });

  it("regex matches are not title cased", async () => {
    testCase.app = buildApp([/www.Example.local/]);

    await testCase.get("/", {
      env: {
        HOST: "www.example.local",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("forbidden");
    assertMatch("Blocked hosts: www.example.local", testCase.response.body);
  });

  it("passes requests to allowed hosts with domain name notation", async () => {
    testCase.app = buildApp(".example.com");

    await testCase.get("/");

    testCase.assertResponse("ok");
    assertEqual("Success", testCase.body);
  });

  it("does not allow domain name notation in the HOST header itself", async () => {
    testCase.app = buildApp(".example.com");

    await testCase.get("/", {
      env: {
        HOST: ".example.com",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("forbidden");
    assertMatch("Blocked hosts: .example.com", testCase.response.body);
  });

  it("checks for requests with #=== to support wider range of host checks", async () => {
    testCase.app = buildApp([(input: string) => input === "www.example.com"]);

    await testCase.get("/");

    testCase.assertResponse("ok");
    assertEqual("Success", testCase.body);
  });

  it("mark the host when authorized", async () => {
    testCase.app = buildApp(".example.com");

    await testCase.get("/");

    assertEqual("www.example.com", testCase.request.getHeader("action_dispatch.authorized_host"));
  });

  it("sanitizes regular expressions to prevent accidental matches", async () => {
    testCase.app = buildApp([/w.example.co/]);

    await testCase.get("/", { env: { "action_dispatch.show_detailed_exceptions": true } });

    testCase.assertResponse("forbidden");
    assertMatch("Blocked hosts: www.example.com", testCase.response.body);
  });

  it("blocks requests to unallowed host supporting custom responses", async () => {
    testCase.app = buildApp(["w.example.co"], {
      responseApp: (_env: RackEnv) => [401, {}, ["Custom"]] as unknown as RackResponse,
    });

    await testCase.get("/");

    testCase.assertResponse("unauthorized");
    assertEqual("Custom", testCase.body);
  });

  it("localhost works in dev", async () => {
    testCase.app = buildApp(ALLOWED_HOSTS_IN_DEVELOPMENT);

    await testCase.get("/", {
      env: {
        HOST: "localhost:3000",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("ok");
    assertMatch("Success", testCase.response.body);
  });

  it("localhost using IPV4 works in dev", async () => {
    testCase.app = buildApp(ALLOWED_HOSTS_IN_DEVELOPMENT);

    await testCase.get("/", {
      env: {
        HOST: "127.0.0.1",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("ok");
    assertMatch("Success", testCase.response.body);
  });

  it("localhost using IPV4 with port works in dev", async () => {
    testCase.app = buildApp(ALLOWED_HOSTS_IN_DEVELOPMENT);

    await testCase.get("/", {
      env: {
        HOST: "127.0.0.1:3000",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("ok");
    assertMatch("Success", testCase.response.body);
  });

  it("localhost using IPV4 binding in all addresses works in dev", async () => {
    testCase.app = buildApp(ALLOWED_HOSTS_IN_DEVELOPMENT);

    await testCase.get("/", {
      env: {
        HOST: "0.0.0.0",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("ok");
    assertMatch("Success", testCase.response.body);
  });

  it("localhost using IPV4 with port binding in all addresses works in dev", async () => {
    testCase.app = buildApp(ALLOWED_HOSTS_IN_DEVELOPMENT);

    await testCase.get("/", {
      env: {
        HOST: "0.0.0.0:3000",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("ok");
    assertMatch("Success", testCase.response.body);
  });

  it("localhost using IPV6 works in dev", async () => {
    testCase.app = buildApp(ALLOWED_HOSTS_IN_DEVELOPMENT);

    await testCase.get("/", {
      env: {
        HOST: "[::1]",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("ok");
    assertMatch("Success", testCase.response.body);
  });

  it("localhost using IPV6 with port works in dev", async () => {
    testCase.app = buildApp(ALLOWED_HOSTS_IN_DEVELOPMENT);

    await testCase.get("/", {
      env: {
        HOST: "[::1]:3000",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("ok");
    assertMatch("Success", testCase.response.body);
  });

  it("localhost using IPV6 binding in all addresses works in dev", async () => {
    testCase.app = buildApp(ALLOWED_HOSTS_IN_DEVELOPMENT);

    await testCase.get("/", {
      env: {
        HOST: "[::]",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("ok");
    assertMatch("Success", testCase.response.body);
  });

  it("localhost using IPV6 with port binding in all addresses works in dev", async () => {
    testCase.app = buildApp(ALLOWED_HOSTS_IN_DEVELOPMENT);

    await testCase.get("/", {
      env: {
        HOST: "[::]:3000",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("ok");
    assertMatch("Success", testCase.response.body);
  });

  it("hosts with port works", async () => {
    testCase.app = buildApp(["host.test"]);

    await testCase.get("/", {
      env: {
        HOST: "host.test:3000",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("ok");
    assertMatch("Success", testCase.response.body);
  });

  it("blocks requests with spoofed X-FORWARDED-HOST", async () => {
    testCase.app = buildApp([new IPAddr("127.0.0.1")]);

    await testCase.get("/", {
      env: {
        HTTP_X_FORWARDED_HOST: "127.0.0.1",
        HOST: "www.example.com",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("forbidden");
    assertMatch("Blocked hosts: www.example.com", testCase.response.body);
  });

  it("blocks requests with spoofed relative X-FORWARDED-HOST", async () => {
    testCase.app = buildApp(["www.example.com"]);

    await testCase.get("/", {
      env: {
        HTTP_X_FORWARDED_HOST: "//randomhost.com",
        HOST: "www.example.com",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("forbidden");
    assertMatch("Blocked hosts: //randomhost.com", testCase.response.body);
  });

  it("forwarded secondary hosts are allowed when permitted", async () => {
    testCase.app = buildApp(".domain.com");

    await testCase.get("/", {
      env: {
        HTTP_X_FORWARDED_HOST: "example.com, my-sub.domain.com",
        HOST: "domain.com",
      },
    });

    testCase.assertResponse("ok");
    assertEqual("Success", testCase.body);
  });

  it("forwarded secondary hosts are blocked when mismatch", async () => {
    testCase.app = buildApp("domain.com");

    await testCase.get("/", {
      env: {
        HTTP_X_FORWARDED_HOST: "domain.com, evil.com",
        HOST: "domain.com",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("forbidden");
    assertMatch("Blocked hosts: evil.com", testCase.response.body);
  });

  it("does not consider IP addresses in X-FORWARDED-HOST spoofed when disabled", async () => {
    testCase.app = buildApp(null);

    await testCase.get("/", {
      env: {
        HTTP_X_FORWARDED_HOST: "127.0.0.1",
        HOST: "www.example.com",
      },
    });

    testCase.assertResponse("ok");
    assertEqual("Success", testCase.body);
  });

  it("detects localhost domain spoofing", async () => {
    testCase.app = buildApp("localhost");

    await testCase.get("/", {
      env: {
        HTTP_X_FORWARDED_HOST: "localhost",
        HOST: "www.example.com",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("forbidden");
    assertMatch("Blocked hosts: www.example.com", testCase.response.body);
  });

  it("forwarded hosts should be permitted", async () => {
    testCase.app = buildApp("domain.com");

    await testCase.get("/", {
      env: {
        HTTP_X_FORWARDED_HOST: "sub.domain.com",
        HOST: "domain.com",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("forbidden");
    assertMatch("Blocked hosts: sub.domain.com", testCase.response.body);
  });

  it("sub-sub domains should not be permitted", async () => {
    testCase.app = buildApp(".domain.com");

    await testCase.get("/", {
      env: {
        HOST: "secondary.sub.domain.com",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("forbidden");
    assertMatch("Blocked hosts: secondary.sub.domain.com", testCase.response.body);
  });

  it("forwarded hosts are allowed when permitted", async () => {
    testCase.app = buildApp(".domain.com");

    await testCase.get("/", {
      env: {
        HTTP_X_FORWARDED_HOST: "my-sub.domain.com",
        HOST: "domain.com",
      },
    });

    testCase.assertResponse("ok");
    assertEqual("Success", testCase.body);
  });

  it("lots of NG hosts", async () => {
    const ngHosts = [
      "hacker%E3%80%82com",
      "hacker%00.com",
      "www.theirsite.com@yoursite.com",
      "hacker.com/test/",
      "hacker%252ecom",
      ".hacker.com",
      "///hacker.com/",
      "/hacker.com",
      "../hacker.com",
      ".hacker.com",
      "@hacker.com",
      "hacker.com",
      "hacker.com%23@example.com",
      "hacker.com/.jpg",
      "hacker.com\texample.com/",
      "hacker.com/example.com",
      "hacker.com@example.com",
      "hacker.com/example.com",
      "hacker.com/",
    ];

    testCase.app = buildApp("example.com");

    for (const host of ngHosts) {
      await testCase.get("/", {
        env: {
          HTTP_X_FORWARDED_HOST: host,
          HOST: "example.com",
          "action_dispatch.show_detailed_exceptions": true,
        },
      });

      testCase.assertResponse("forbidden");
      assertMatch(`Blocked hosts: ${host}`, testCase.response.body);
    }
  });

  it("exclude matches allow any host", async () => {
    testCase.app = buildApp("only.com", { exclude: (req: Request) => req.path === "/foo" });

    await testCase.get("/foo");

    testCase.assertResponse("ok");
    assertEqual("Success", testCase.body);
  });

  it("exclude misses block unallowed hosts", async () => {
    testCase.app = buildApp("only.com", { exclude: (req: Request) => req.path === "/bar" });

    await testCase.get("/foo", { env: { "action_dispatch.show_detailed_exceptions": true } });

    testCase.assertResponse("forbidden");
    assertMatch("Blocked hosts: www.example.com", testCase.response.body);
  });

  it("blocks requests with invalid hostnames", async () => {
    testCase.app = buildApp(".example.com", { lint: false });

    await testCase.get("/", {
      env: {
        HOST: "attacker.com#x.example.com",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("forbidden");
    assertMatch("Blocked hosts: attacker.com#x.example.com", testCase.response.body);
  });

  it("blocks requests to similar host", async () => {
    testCase.app = buildApp("sub.example.com");

    await testCase.get("/", {
      env: {
        HOST: "sub-example.com",
        "action_dispatch.show_detailed_exceptions": true,
      },
    });

    testCase.assertResponse("forbidden");
    assertMatch("Blocked hosts: sub-example.com", testCase.response.body);
  });

  it("uses logger from the env", async () => {
    testCase.app = buildApp(["only.com"]);
    const output = new StringIO();

    await testCase.get("/", { env: { "action_dispatch.logger": new Logger(output) } });

    testCase.assertResponse("forbidden");
    output.rewind();
    assertMatch("Blocked hosts: www.example.com", output.read());
  });

  it("uses ActionView::Base logger when no logger in the env", async () => {
    testCase.app = buildApp(["only.com"]);
    const output = new StringIO();
    const logger = new Logger(output);

    const _old = Base.logger;
    Base.logger = logger;
    try {
      await testCase.get("/");
    } finally {
      Base.logger = _old;
    }

    testCase.assertResponse("forbidden");
    output.rewind();
    assertMatch("Blocked hosts: www.example.com", output.read());
  });
});
