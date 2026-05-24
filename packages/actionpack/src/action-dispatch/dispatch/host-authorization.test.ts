import { describe, it, expect } from "vitest";
import {
  HostAuthorization,
  IPAddr,
  ALLOWED_HOSTS_IN_DEVELOPMENT,
  type HostPermission,
} from "../middleware/host-authorization.js";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { bodyFromString, bodyToString } from "@blazetrails/rack";

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
    expect((headers as Record<string, string>)["content-type"]).toContain("text/html");
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
    expect((headers as Record<string, string>)["content-type"]).toContain("text/html");
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
    expect((headers as Record<string, string>)["content-type"]).toContain("text/plain");
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
      exclude: (env) => (env["PATH_INFO"] as string) === "/health",
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
      exclude: (env) => (env["PATH_INFO"] as string) === "/health",
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

// Rails-verbatim port of actionpack/test/dispatch/host_authorization_test.rb
const successApp = async (_env: RackEnv): Promise<RackResponse> => [
  200,
  { "content-type": "text/plain" },
  bodyFromString("Success"),
];

function buildApp(
  hosts: HostPermission | HostPermission[] | null | undefined,
  opts: {
    exclude?: (env: RackEnv) => boolean;
    responseApp?: (env: RackEnv) => Promise<RackResponse>;
  } = {},
) {
  const h: HostPermission[] = hosts == null ? [] : Array.isArray(hosts) ? hosts : [hosts];
  return new HostAuthorization(successApp, { hosts: h, ...opts });
}

describe("HostAuthorizationTest", () => {
  it("blocks requests to unallowed host with empty body", async () => {
    const mw = buildApp(["only.com"]);
    const [status, , body] = await mw.call({
      HTTP_HOST: "www.example.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(403);
    expect(await bodyToString(body)).toBe("");
  });

  it("renders debug info when all requests considered as local", async () => {
    const mw = buildApp(["only.com"]);
    const [status, , body] = await mw.call({
      HTTP_HOST: "www.example.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      "action_dispatch.show_detailed_exceptions": true,
    });
    expect(status).toBe(403);
    expect(await bodyToString(body)).toContain("Blocked hosts: www.example.com");
  });

  it("allows all requests if hosts is empty", async () => {
    const mw = buildApp(null);
    const [status, , body] = await mw.call({
      HTTP_HOST: "www.example.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(200);
    expect(await bodyToString(body)).toBe("Success");
  });

  it("hosts can be a single element array", async () => {
    const mw = buildApp(["www.example.com"]);
    const [status, , body] = await mw.call({
      HTTP_HOST: "www.example.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(200);
    expect(await bodyToString(body)).toBe("Success");
  });

  it("hosts can be a string", async () => {
    const mw = buildApp("www.example.com");
    const [status, , body] = await mw.call({
      HTTP_HOST: "www.example.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(200);
    expect(await bodyToString(body)).toBe("Success");
  });

  it("hosts are matched case insensitive", async () => {
    const mw = buildApp("Example.local");
    const [status, , body] = await mw.call({
      HTTP_HOST: "example.local",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(200);
    expect(await bodyToString(body)).toBe("Success");
  });

  it("hosts are matched case insensitive with titlecased host", async () => {
    const mw = buildApp("example.local");
    const [status, , body] = await mw.call({
      HTTP_HOST: "Example.local",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(200);
    expect(await bodyToString(body)).toBe("Success");
  });

  it("hosts are matched case insensitive with hosts array", async () => {
    const mw = buildApp(["Example.local"]);
    const [status, , body] = await mw.call({
      HTTP_HOST: "example.local",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(200);
    expect(await bodyToString(body)).toBe("Success");
  });

  it("regex matches are not title cased", async () => {
    const mw = buildApp([/www.Example.local/]);
    const [status, , body] = await mw.call({
      HTTP_HOST: "www.example.local",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      "action_dispatch.show_detailed_exceptions": true,
    });
    expect(status).toBe(403);
    expect(await bodyToString(body)).toContain("Blocked hosts: www.example.local");
  });

  it("passes requests to allowed hosts with domain name notation", async () => {
    const mw = buildApp(".example.com");
    const [status, , body] = await mw.call({
      HTTP_HOST: "www.example.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(200);
    expect(await bodyToString(body)).toBe("Success");
  });

  it("does not allow domain name notation in the HOST header itself", async () => {
    const mw = buildApp(".example.com");
    const [status, , body] = await mw.call({
      HTTP_HOST: ".example.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      "action_dispatch.show_detailed_exceptions": true,
    });
    expect(status).toBe(403);
    expect(await bodyToString(body)).toContain("Blocked hosts: .example.com");
  });

  it.skip("checks for requests with #=== to support wider range of host checks", () => {
    // HostPermission type does not support arbitrary callable predicates
  });

  it("mark the host when authorized", async () => {
    const env: RackEnv = { HTTP_HOST: "www.example.com", REQUEST_METHOD: "GET", PATH_INFO: "/" };
    const mw = buildApp(".example.com");
    await mw.call(env);
    expect(env["action_dispatch.authorized_host"]).toBe("www.example.com");
  });

  it("sanitizes regular expressions to prevent accidental matches", async () => {
    const mw = buildApp([/w.example.co/]);
    const [status, , body] = await mw.call({
      HTTP_HOST: "www.example.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      "action_dispatch.show_detailed_exceptions": true,
    });
    expect(status).toBe(403);
    expect(await bodyToString(body)).toContain("Blocked hosts: www.example.com");
  });

  it("blocks requests to unallowed host supporting custom responses", async () => {
    const mw = buildApp(["w.example.co"], {
      responseApp: async (_env) => [401, {}, bodyFromString("Custom")],
    });
    const [status, , body] = await mw.call({
      HTTP_HOST: "www.example.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(401);
    expect(await bodyToString(body)).toBe("Custom");
  });

  it("localhost works in dev", async () => {
    const mw = new HostAuthorization(successApp, { hosts: ALLOWED_HOSTS_IN_DEVELOPMENT });
    const [status, , body] = await mw.call({
      HTTP_HOST: "localhost:3000",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      "action_dispatch.show_detailed_exceptions": true,
    });
    expect(status).toBe(200);
    expect(await bodyToString(body)).toBe("Success");
  });

  it("localhost using IPV4 works in dev", async () => {
    const mw = new HostAuthorization(successApp, { hosts: ALLOWED_HOSTS_IN_DEVELOPMENT });
    const [status, , body] = await mw.call({
      HTTP_HOST: "127.0.0.1",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      "action_dispatch.show_detailed_exceptions": true,
    });
    expect(status).toBe(200);
    expect(await bodyToString(body)).toBe("Success");
  });

  it("localhost using IPV4 with port works in dev", async () => {
    const mw = new HostAuthorization(successApp, { hosts: ALLOWED_HOSTS_IN_DEVELOPMENT });
    const [status] = await mw.call({
      HTTP_HOST: "127.0.0.1:3000",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(200);
  });

  it("localhost using IPV4 binding in all addresses works in dev", async () => {
    const mw = new HostAuthorization(successApp, { hosts: ALLOWED_HOSTS_IN_DEVELOPMENT });
    const [status] = await mw.call({ HTTP_HOST: "0.0.0.0", REQUEST_METHOD: "GET", PATH_INFO: "/" });
    expect(status).toBe(200);
  });

  it("localhost using IPV4 with port binding in all addresses works in dev", async () => {
    const mw = new HostAuthorization(successApp, { hosts: ALLOWED_HOSTS_IN_DEVELOPMENT });
    const [status] = await mw.call({
      HTTP_HOST: "0.0.0.0:3000",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(200);
  });

  it("localhost using IPV6 works in dev", async () => {
    const mw = new HostAuthorization(successApp, { hosts: ALLOWED_HOSTS_IN_DEVELOPMENT });
    const [status] = await mw.call({ HTTP_HOST: "[::1]", REQUEST_METHOD: "GET", PATH_INFO: "/" });
    expect(status).toBe(200);
  });

  it("localhost using IPV6 with port works in dev", async () => {
    const mw = new HostAuthorization(successApp, { hosts: ALLOWED_HOSTS_IN_DEVELOPMENT });
    const [status] = await mw.call({
      HTTP_HOST: "[::1]:3000",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(200);
  });

  it("localhost using IPV6 binding in all addresses works in dev", async () => {
    const mw = new HostAuthorization(successApp, { hosts: ALLOWED_HOSTS_IN_DEVELOPMENT });
    const [status] = await mw.call({ HTTP_HOST: "[::]", REQUEST_METHOD: "GET", PATH_INFO: "/" });
    expect(status).toBe(200);
  });

  it("localhost using IPV6 with port binding in all addresses works in dev", async () => {
    const mw = new HostAuthorization(successApp, { hosts: ALLOWED_HOSTS_IN_DEVELOPMENT });
    const [status] = await mw.call({
      HTTP_HOST: "[::]:3000",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(200);
  });

  it("hosts with port works", async () => {
    const mw = buildApp(["host.test"]);
    const [status, , body] = await mw.call({
      HTTP_HOST: "host.test:3000",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      "action_dispatch.show_detailed_exceptions": true,
    });
    expect(status).toBe(200);
    expect(await bodyToString(body)).toBe("Success");
  });

  it("blocks requests with spoofed X-FORWARDED-HOST", async () => {
    const mw = buildApp([new IPAddr("127.0.0.1")]);
    const [status, , body] = await mw.call({
      HTTP_HOST: "www.example.com",
      HTTP_X_FORWARDED_HOST: "127.0.0.1",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      "action_dispatch.show_detailed_exceptions": true,
    });
    expect(status).toBe(403);
    expect(await bodyToString(body)).toContain("Blocked hosts: www.example.com");
  });

  it("blocks requests with spoofed relative X-FORWARDED-HOST", async () => {
    const mw = buildApp(["www.example.com"]);
    const [status, , body] = await mw.call({
      HTTP_HOST: "www.example.com",
      HTTP_X_FORWARDED_HOST: "//randomhost.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      "action_dispatch.show_detailed_exceptions": true,
    });
    expect(status).toBe(403);
    expect(await bodyToString(body)).toContain("Blocked hosts: //randomhost.com");
  });

  it("forwarded secondary hosts are allowed when permitted", async () => {
    const mw = buildApp(".domain.com");
    const [status, , body] = await mw.call({
      HTTP_HOST: "domain.com",
      HTTP_X_FORWARDED_HOST: "example.com, my-sub.domain.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(200);
    expect(await bodyToString(body)).toBe("Success");
  });

  it("forwarded secondary hosts are blocked when mismatch", async () => {
    const mw = buildApp("domain.com");
    const [status, , body] = await mw.call({
      HTTP_HOST: "domain.com",
      HTTP_X_FORWARDED_HOST: "domain.com, evil.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      "action_dispatch.show_detailed_exceptions": true,
    });
    expect(status).toBe(403);
    expect(await bodyToString(body)).toContain("Blocked hosts: evil.com");
  });

  it("does not consider IP addresses in X-FORWARDED-HOST spoofed when disabled", async () => {
    const mw = buildApp(null);
    const [status, , body] = await mw.call({
      HTTP_HOST: "www.example.com",
      HTTP_X_FORWARDED_HOST: "127.0.0.1",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(200);
    expect(await bodyToString(body)).toBe("Success");
  });

  it("detects localhost domain spoofing", async () => {
    const mw = buildApp("localhost");
    const [status, , body] = await mw.call({
      HTTP_HOST: "www.example.com",
      HTTP_X_FORWARDED_HOST: "localhost",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      "action_dispatch.show_detailed_exceptions": true,
    });
    expect(status).toBe(403);
    expect(await bodyToString(body)).toContain("Blocked hosts: www.example.com");
  });

  it("forwarded hosts should be permitted", async () => {
    const mw = buildApp("domain.com");
    const [status, , body] = await mw.call({
      HTTP_HOST: "domain.com",
      HTTP_X_FORWARDED_HOST: "sub.domain.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      "action_dispatch.show_detailed_exceptions": true,
    });
    expect(status).toBe(403);
    expect(await bodyToString(body)).toContain("Blocked hosts: sub.domain.com");
  });

  it("sub-sub domains should not be permitted", async () => {
    const mw = buildApp(".domain.com");
    const [status, , body] = await mw.call({
      HTTP_HOST: "secondary.sub.domain.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      "action_dispatch.show_detailed_exceptions": true,
    });
    expect(status).toBe(403);
    expect(await bodyToString(body)).toContain("Blocked hosts: secondary.sub.domain.com");
  });

  it("forwarded hosts are allowed when permitted", async () => {
    const mw = buildApp(".domain.com");
    const [status, , body] = await mw.call({
      HTTP_HOST: "domain.com",
      HTTP_X_FORWARDED_HOST: "my-sub.domain.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(200);
    expect(await bodyToString(body)).toBe("Success");
  });

  it("lots of NG hosts", async () => {
    const ngHosts = [
      "hacker%E3%80%82com",
      "hacker%00.com",
      "www.theirsite.com@yoursite.com",
      "hacker.com/test/",
      "hacker%252ecom",
      ".hacker.com",
      "/\\/\\/hacker.com/",
      "/hacker.com",
      "../hacker.com",
      "@hacker.com",
      "hacker.com",
      "hacker.com%23@example.com",
      "hacker.com/.jpg",
      "hacker.com\texample.com/",
      "hacker.com/example.com",
      "hacker.com\\@example.com",
      "hacker.com/",
    ];
    const mw = buildApp("example.com");
    for (const host of ngHosts) {
      const [status, , body] = await mw.call({
        HTTP_HOST: "example.com",
        HTTP_X_FORWARDED_HOST: host,
        REQUEST_METHOD: "GET",
        PATH_INFO: "/",
        "action_dispatch.show_detailed_exceptions": true,
      });
      expect(status).toBe(403);
      expect(await bodyToString(body)).toContain(`Blocked hosts: ${host}`);
    }
  });

  it("exclude matches allow any host", async () => {
    const mw = buildApp("only.com", { exclude: (env) => env["PATH_INFO"] === "/foo" });
    const [status, , body] = await mw.call({
      HTTP_HOST: "www.example.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/foo",
    });
    expect(status).toBe(200);
    expect(await bodyToString(body)).toBe("Success");
  });

  it("exclude misses block unallowed hosts", async () => {
    const mw = buildApp("only.com", { exclude: (env) => env["PATH_INFO"] === "/bar" });
    const [status, , body] = await mw.call({
      HTTP_HOST: "www.example.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/foo",
      "action_dispatch.show_detailed_exceptions": true,
    });
    expect(status).toBe(403);
    expect(await bodyToString(body)).toContain("Blocked hosts: www.example.com");
  });

  it("blocks requests with invalid hostnames", async () => {
    const mw = buildApp(".example.com");
    const [status, , body] = await mw.call({
      HTTP_HOST: "attacker.com#x.example.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      "action_dispatch.show_detailed_exceptions": true,
    });
    expect(status).toBe(403);
    expect(await bodyToString(body)).toContain("Blocked hosts: attacker.com#x.example.com");
  });

  it("blocks requests to similar host", async () => {
    const mw = buildApp("sub.example.com");
    const [status, , body] = await mw.call({
      HTTP_HOST: "sub-example.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      "action_dispatch.show_detailed_exceptions": true,
    });
    expect(status).toBe(403);
    expect(await bodyToString(body)).toContain("Blocked hosts: sub-example.com");
  });

  it("uses logger from the env", async () => {
    const mw = buildApp(["only.com"]);
    const messages: string[] = [];
    const [status] = await mw.call({
      HTTP_HOST: "www.example.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      "action_dispatch.logger": { error: (msg: string) => messages.push(msg) },
    });
    expect(status).toBe(403);
    expect(messages.join("")).toContain("Blocked hosts: www.example.com");
  });

  it.skip("uses ActionView::Base logger when no logger in the env", () => {
    // ActionView::Base is not yet ported to trails
  });
});
