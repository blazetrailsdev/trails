/**
 * Smoke tests for RemoteIp middleware. Full Rails-mirrored cases
 * (actionpack/test/dispatch/request_test.rb RequestIP class) follow up
 * in a sibling PR.
 */

import { describe, it, expect } from "vitest";
import { Request } from "../http/request.js";
import { RemoteIp, IpSpoofAttackError, TRUSTED_PROXIES, type Proxy } from "./remote-ip.js";

async function callMw(
  env: Record<string, unknown>,
  check = true,
  proxies: Proxy[] = [...TRUSTED_PROXIES],
) {
  async function* emptyBody(): AsyncGenerator<string> {}
  const mw = new RemoteIp(async () => [200, {}, emptyBody()], check, proxies);
  await mw.call(env);
  return new Request(env);
}

describe("RemoteIp middleware (smoke)", () => {
  it("returns REMOTE_ADDR when no proxy headers", async () => {
    expect((await callMw({ REMOTE_ADDR: "1.2.3.4" })).remoteIp).toBe("1.2.3.4");
  });

  it("prefers X-Forwarded-For over trusted REMOTE_ADDR", async () => {
    expect(
      (await callMw({ REMOTE_ADDR: "127.0.0.1", HTTP_X_FORWARDED_FOR: "3.4.5.6" })).remoteIp,
    ).toBe("3.4.5.6");
  });

  it("filters trusted proxies and returns the leftmost untrusted IP", async () => {
    expect(
      (await callMw({ HTTP_X_FORWARDED_FOR: "9.9.9.9, 3.4.5.6, 172.31.4.4, 10.0.0.1" })).remoteIp,
    ).toBe("3.4.5.6");
  });

  it("supports IPv6 with CIDR-based trusted proxies", async () => {
    const v6 = "fe80:0000:0000:0000:0202:b3ff:fe1e:8329";
    expect((await callMw({ REMOTE_ADDR: "::1", HTTP_X_FORWARDED_FOR: v6 })).remoteIp).toBe(v6);
  });

  it("raises IpSpoofAttackError when Client-Ip and X-Forwarded-For disagree", async () => {
    const req = await callMw({ HTTP_X_FORWARDED_FOR: "1.1.1.1", HTTP_CLIENT_IP: "2.2.2.2" });
    expect(() => req.remoteIp).toThrow(IpSpoofAttackError);
  });

  it("respects ip_spoofing_check = false", async () => {
    const req = await callMw({ HTTP_X_FORWARDED_FOR: "1.1.1.1", HTTP_CLIENT_IP: "2.2.2.2" }, false);
    expect(req.remoteIp).toBe("1.1.1.1");
  });

  it("returns null when no valid IP can be derived", async () => {
    expect((await callMw({ HTTP_X_FORWARDED_FOR: "not_ip_address" })).remoteIp).toBeNull();
  });

  it("accepts a RegExp custom proxy", async () => {
    const req = await callMw(
      { REMOTE_ADDR: "67.205.106.73", HTTP_X_FORWARDED_FOR: "3.4.5.6" },
      true,
      [...TRUSTED_PROXIES, /^67\.205\.106\.73$/i],
    );
    expect(req.remoteIp).toBe("3.4.5.6");
  });

  it("allows the setter to override", async () => {
    const req = await callMw({ REMOTE_ADDR: "1.2.3.4" });
    req.remoteIp = "2.3.4.5";
    expect(req.remoteIp).toBe("2.3.4.5");
  });

  it("Request#remoteIp falls back to REMOTE_ADDR without middleware", () => {
    expect(new Request({ REMOTE_ADDR: "127.0.0.1" }).remoteIp).toBe("127.0.0.1");
  });
});
