import { describe, it, expect, beforeEach } from "vitest";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { ContentSecurityPolicy, Middleware } from "../http/content-security-policy.js";
import { Request } from "../http/request.js";
import { CONTENT_SECURITY_POLICY, CONTENT_SECURITY_POLICY_REPORT_ONLY } from "../constants.js";
import { rbObjDup } from "@blazetrails/ruby-compat";

describe("ContentSecurityPolicyTest", () => {
  it("dup keeps a dynamic source callable", () => {
    const policy = new ContentSecurityPolicy();
    policy.scriptSrc(() => "https://example.com");
    const copy = rbObjDup(policy);
    expect(copy.build({})).toBe("script-src https://example.com");
  });

  it("report_uri stores a nil uri instead of deleting the directive", () => {
    const policy = new ContentSecurityPolicy();
    policy.reportUri(null as unknown as string);
    expect(() => policy.build()).toThrow("Unexpected content security policy source: null");
  });
});

const DEFAULT_CSP = "default-src 'self' https: http:";

function buildEnv(overrides: Record<string, unknown> = {}): RackEnv {
  const policy = new ContentSecurityPolicy();
  policy.defaultSrc(() => "'self'");
  return {
    REQUEST_METHOD: "GET",
    PATH_INFO: "/",
    "action_dispatch.content_security_policy": policy,
    "action_dispatch.content_security_policy_nonce_generator": () => "iyhD0Yc0W+c=",
    "action_dispatch.content_security_policy_report_only": false,
    ...overrides,
  };
}

describe("ContentSecurityPolicyMiddlewareTest", () => {
  let env: RackEnv;

  beforeEach(() => {
    env = buildEnv();
  });

  it("uses report-only header when configured", async () => {
    env["action_dispatch.content_security_policy_report_only"] = true;
    const app = async (): Promise<RackResponse> => [200, {}, [""]];
    const mw = new Middleware(app);
    const [, headers] = await mw.call(env);
    expect(headers[CONTENT_SECURITY_POLICY_REPORT_ONLY]).toBeDefined();
    expect(headers[CONTENT_SECURITY_POLICY]).toBeUndefined();
  });

  it("skips CSP injection on 304 Not Modified", async () => {
    const app = async (): Promise<RackResponse> => [304, {}, [""]];
    const mw = new Middleware(app);
    const [, headers] = await mw.call(env);
    expect(headers[CONTENT_SECURITY_POLICY]).toBeUndefined();
  });

  it("returns response unchanged when no policy is set", async () => {
    const noPolicyEnv: RackEnv = { REQUEST_METHOD: "GET", PATH_INFO: "/" };
    const app = async (): Promise<RackResponse> => [200, {}, [""]];
    const mw = new Middleware(app);
    const [, headers] = await mw.call(noPolicyEnv);
    expect(headers[CONTENT_SECURITY_POLICY]).toBeUndefined();
  });

  it("includes a nonce when generator is configured", async () => {
    const policy = new ContentSecurityPolicy();
    policy.scriptSrc("'self'");
    env["action_dispatch.content_security_policy"] = policy;
    const app = async (): Promise<RackResponse> => [200, {}, [""]];
    const mw = new Middleware(app);
    const [, headers] = await mw.call(env);
    expect(headers[CONTENT_SECURITY_POLICY]).toContain("'nonce-iyhD0Yc0W+c='");
  });

  it("memoizes the nonce across reads (one per request)", async () => {
    let calls = 0;
    env["action_dispatch.content_security_policy_nonce_generator"] = () => {
      calls++;
      return "abc";
    };
    const request = new Request(env);
    expect(request.contentSecurityPolicyNonce).toBe("abc");
    expect(request.contentSecurityPolicyNonce).toBe("abc");
    expect(request.contentSecurityPolicyNonce).toBe("abc");
    expect(calls).toBe(1);

    for (const stale of [null, false, undefined]) {
      const staleEnv = { ...env, "action_dispatch.content_security_policy_nonce": stale };
      expect(new Request(staleEnv).contentSecurityPolicyNonce).toBe("abc");
    }
    expect(calls).toBe(4);
  });

  it("respects custom nonce-directives env override", async () => {
    env["action_dispatch.content_security_policy_nonce_directives"] = ["script-src"];
    const policy = new ContentSecurityPolicy();
    policy.scriptSrc("'self'");
    policy.styleSrc("'self'");
    env["action_dispatch.content_security_policy"] = policy;
    const app = async (): Promise<RackResponse> => [200, {}, [""]];
    const [, headers] = await new Middleware(app).call(env);
    const header = headers[CONTENT_SECURITY_POLICY];
    expect(header).toMatch(/script-src 'self' 'nonce-/);
    expect(header).not.toMatch(/style-src 'self' 'nonce-/);
  });
});
