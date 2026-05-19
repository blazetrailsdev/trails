import { describe, it, expect, beforeEach } from "vitest";
import { bodyFromString } from "@blazetrails/rack";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { ContentSecurityPolicyMiddleware } from "./content-security-policy.js";
import {
  ContentSecurityPolicy,
  contentSecurityPolicyNonce,
} from "../http/content-security-policy.js";
import { Request } from "../http/request.js";
import { CONTENT_SECURITY_POLICY, CONTENT_SECURITY_POLICY_REPORT_ONLY } from "../constants.js";

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

describe("ContentSecurityPolicyMiddleware", () => {
  let env: RackEnv;

  beforeEach(() => {
    env = buildEnv();
  });

  // Rails: test_rack_lint — trails has no Rack::Lint, so we exercise the
  // middleware end-to-end and assert it produces a CSP header without raising.
  it("rack lint", async () => {
    const app = async (): Promise<RackResponse> => [200, {}, bodyFromString("")];
    const mw = new ContentSecurityPolicyMiddleware(app);
    const [, headers] = await mw.call(env);
    expect(headers[CONTENT_SECURITY_POLICY]).toContain("default-src 'self'");
  });

  it("does not override app content security policy", async () => {
    const app = async (): Promise<RackResponse> => [
      200,
      { [CONTENT_SECURITY_POLICY]: DEFAULT_CSP },
      bodyFromString(""),
    ];
    const mw = new ContentSecurityPolicyMiddleware(app);
    const [, headers] = await mw.call(env);
    expect(headers[CONTENT_SECURITY_POLICY]).toBe(DEFAULT_CSP);
  });

  it("does not override app content security policy report only", async () => {
    env["action_dispatch.content_security_policy_report_only"] = true;
    const app = async (): Promise<RackResponse> => [
      200,
      { [CONTENT_SECURITY_POLICY_REPORT_ONLY]: DEFAULT_CSP },
      bodyFromString(""),
    ];
    const mw = new ContentSecurityPolicyMiddleware(app);
    const [, headers] = await mw.call(env);
    expect(headers[CONTENT_SECURITY_POLICY_REPORT_ONLY]).toBe(DEFAULT_CSP);
  });

  it("uses report-only header when configured", async () => {
    env["action_dispatch.content_security_policy_report_only"] = true;
    const app = async (): Promise<RackResponse> => [200, {}, bodyFromString("")];
    const mw = new ContentSecurityPolicyMiddleware(app);
    const [, headers] = await mw.call(env);
    expect(headers[CONTENT_SECURITY_POLICY_REPORT_ONLY]).toBeDefined();
    expect(headers[CONTENT_SECURITY_POLICY]).toBeUndefined();
  });

  it("skips CSP injection on 304 Not Modified", async () => {
    const app = async (): Promise<RackResponse> => [304, {}, bodyFromString("")];
    const mw = new ContentSecurityPolicyMiddleware(app);
    const [, headers] = await mw.call(env);
    expect(headers[CONTENT_SECURITY_POLICY]).toBeUndefined();
  });

  it("returns response unchanged when no policy is set", async () => {
    const noPolicyEnv: RackEnv = { REQUEST_METHOD: "GET", PATH_INFO: "/" };
    const app = async (): Promise<RackResponse> => [200, {}, bodyFromString("")];
    const mw = new ContentSecurityPolicyMiddleware(app);
    const [, headers] = await mw.call(noPolicyEnv);
    expect(headers[CONTENT_SECURITY_POLICY]).toBeUndefined();
  });

  it("includes a nonce when generator is configured", async () => {
    const policy = new ContentSecurityPolicy();
    policy.scriptSrc("'self'");
    env["action_dispatch.content_security_policy"] = policy;
    const app = async (): Promise<RackResponse> => [200, {}, bodyFromString("")];
    const mw = new ContentSecurityPolicyMiddleware(app);
    const [, headers] = await mw.call(env);
    expect(headers[CONTENT_SECURITY_POLICY]).toContain("'nonce-iyhD0Yc0W+c='");
  });

  it("memoizes the nonce across reads (one per request)", async () => {
    // Mirrors Rails' "one nonce per request" invariant
    // (content_security_policy.rb:112-120): repeated reads of
    // content_security_policy_nonce return the cached env value rather than
    // re-invoking the generator. We assert this directly on the Request mixin
    // since the middleware itself only reads the nonce once per request.
    let calls = 0;
    env["action_dispatch.content_security_policy_nonce_generator"] = () => {
      calls++;
      return "abc";
    };
    const request = new Request(env);
    expect(contentSecurityPolicyNonce.call(request)).toBe("abc");
    expect(contentSecurityPolicyNonce.call(request)).toBe("abc");
    expect(contentSecurityPolicyNonce.call(request)).toBe("abc");
    expect(calls).toBe(1);
  });

  it("respects custom nonce-directives env override", async () => {
    env["action_dispatch.content_security_policy_nonce_directives"] = ["script-src"];
    const policy = new ContentSecurityPolicy();
    policy.scriptSrc("'self'");
    policy.styleSrc("'self'");
    env["action_dispatch.content_security_policy"] = policy;
    const app = async (): Promise<RackResponse> => [200, {}, bodyFromString("")];
    const [, headers] = await new ContentSecurityPolicyMiddleware(app).call(env);
    const header = headers[CONTENT_SECURITY_POLICY] as string;
    expect(header).toMatch(/script-src 'self' 'nonce-/);
    expect(header).not.toMatch(/style-src 'self' 'nonce-/);
  });
});
