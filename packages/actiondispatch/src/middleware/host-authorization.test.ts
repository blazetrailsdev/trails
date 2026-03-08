import { describe, it, expect } from "vitest";
import { HostAuthorization } from "./host-authorization.js";
import type { RackEnv, RackResponse } from "@rails-ts/rack";
import { bodyFromString, bodyToString } from "@rails-ts/rack";

const okApp = async (_env: RackEnv): Promise<RackResponse> => [
  200,
  { "content-type": "text/plain" },
  bodyFromString("OK"),
];

describe("ActionDispatch::HostAuthorization", () => {
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
    const [status, _, body] = await mw.call({
      HTTP_HOST: "evil.com",
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
    });
    expect(status).toBe(403);
    expect(await bodyToString(body)).toContain("Blocked host: evil.com");
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

  it("nested subdomains match wildcard", async () => {
    const mw = new HostAuthorization(okApp, { hosts: [".example.com"] });
    const [status] = await mw.call({
      HTTP_HOST: "deep.sub.example.com",
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
});
