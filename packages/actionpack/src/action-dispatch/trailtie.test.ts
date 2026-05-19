import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Railtie as BaseRailtie } from "@blazetrails/activesupport";
import {
  Trailtie,
  type ActionDispatchConfig,
  type ContentSecurityPolicyConfig,
} from "./trailtie.js";
import { ContentSecurityPolicy } from "./http/content-security-policy.js";
import { ContentSecurityPolicyMiddleware } from "./middleware/content-security-policy.js";
import { URL as HttpURL } from "./http/url.js";
import { QueryParser } from "./http/query-parser.js";
import { RequestUtils } from "./request/utils.js";
import { CacheConfig } from "./http/cache.js";
import { Response } from "./http/response.js";
import { X_REQUEST_ID } from "./constants.js";

function cfg(): ActionDispatchConfig {
  return Trailtie.config["actionDispatch"] as ActionDispatchConfig;
}

describe("ActionDispatch::Trailtie", () => {
  let savedConfig: ActionDispatchConfig;
  let savedCspConfig: ContentSecurityPolicyConfig;
  let savedTldLength: number;
  let savedStrictQuery: boolean | null;
  let savedPerformDeepMunge: boolean;
  let savedStrictFreshness: boolean;
  let savedDefaultCharset: string;
  let hadDeprecator: boolean;
  let savedDeprecator: (typeof BaseRailtie.deprecators)[string];

  beforeEach(() => {
    savedConfig = structuredClone(cfg());
    savedCspConfig = {
      ...(Trailtie.config["contentSecurityPolicy"] as ContentSecurityPolicyConfig),
    };
    savedTldLength = HttpURL.tldLength;
    savedStrictQuery = QueryParser.strictQueryStringSeparator;
    savedPerformDeepMunge = RequestUtils.performDeepMunge;
    savedStrictFreshness = CacheConfig.strictFreshness;
    savedDefaultCharset = Response.defaultCharset;
    hadDeprecator = "actionDispatch" in BaseRailtie.deprecators;
    savedDeprecator = BaseRailtie.deprecators["actionDispatch"];
  });

  afterEach(() => {
    Trailtie.config["actionDispatch"] = savedConfig;
    Trailtie.config["contentSecurityPolicy"] = savedCspConfig;
    HttpURL.tldLength = savedTldLength;
    QueryParser.strictQueryStringSeparator = savedStrictQuery;
    RequestUtils.performDeepMunge = savedPerformDeepMunge;
    CacheConfig.strictFreshness = savedStrictFreshness;
    Response.defaultCharset = savedDefaultCharset;
    if (hadDeprecator) BaseRailtie.deprecators["actionDispatch"] = savedDeprecator;
    else delete BaseRailtie.deprecators["actionDispatch"];
  });

  it("registers itself with the Railtie registry", () => {
    expect(BaseRailtie.subclasses).toContain(Trailtie);
  });

  it("seeds Rails-compatible defaults on config.actionDispatch", () => {
    const c = cfg();
    expect(c.ipSpoofingCheck).toBe(true);
    expect(c.showExceptions).toBe("all");
    expect(c.tldLength).toBe(1);
    expect(c.performDeepMunge).toBe(true);
    expect(c.requestIdHeader).toBe(X_REQUEST_ID);
    expect(c.debugExceptionLogLevel).toBe("fatal");
    expect(c.httpAuthSalt).toBe("http authentication");
    expect(c.defaultHeaders["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(c.cookiesRotations).toBeNull();
  });

  it("runInitializers copies config onto framework holders", () => {
    const c = cfg();
    c.tldLength = 2;
    c.strictQueryStringSeparator = true;
    c.performDeepMunge = false;
    c.strictFreshness = true;

    Trailtie.runInitializers();

    expect(HttpURL.tldLength).toBe(2);
    expect(QueryParser.strictQueryStringSeparator).toBe(true);
    expect(RequestUtils.performDeepMunge).toBe(false);
    expect(CacheConfig.strictFreshness).toBe(true);
    expect(BaseRailtie.deprecators["actionDispatch"]).toBeDefined();
  });

  it("runInitializers copies defaultCharset onto Response when configured", () => {
    cfg().defaultCharset = "iso-8859-1";
    Trailtie.runInitializers();
    expect(Response.defaultCharset).toBe("iso-8859-1");
  });

  it("seeds Rails-compatible defaults on config.contentSecurityPolicy", () => {
    const c = Trailtie.config["contentSecurityPolicy"] as ContentSecurityPolicyConfig;
    expect(c.policy).toBeNull();
    expect(c.reportOnly).toBe(false);
    expect(c.nonceGenerator).toBeNull();
    expect(c.nonceDirectives).toBeNull();
  });

  it("defaultMiddleware contributes ContentSecurityPolicyMiddleware", () => {
    const stack = Trailtie.defaultMiddleware();
    const klasses = [...stack].map((e) => e.klass);
    expect(klasses).toContain(ContentSecurityPolicyMiddleware);
  });

  it("seedContentSecurityPolicyEnv copies config slots onto request env", () => {
    const headers: Record<string, unknown> = {};
    const req = {
      getHeader: (k: string) => headers[k],
      setHeader: (k: string, v: unknown) => (headers[k] = v),
    };
    const policy = new ContentSecurityPolicy((p) => p.defaultSrc("'self'"));
    const generator = () => "abc";
    const cfg = Trailtie.config["contentSecurityPolicy"] as ContentSecurityPolicyConfig;
    cfg.policy = policy;
    cfg.reportOnly = true;
    cfg.nonceGenerator = generator;
    cfg.nonceDirectives = ["script-src"];

    Trailtie.seedContentSecurityPolicyEnv(req);

    expect(headers["action_dispatch.content_security_policy"]).toBe(policy);
    expect(headers["action_dispatch.content_security_policy_report_only"]).toBe(true);
    expect(headers["action_dispatch.content_security_policy_nonce_generator"]).toBe(generator);
    expect(headers["action_dispatch.content_security_policy_nonce_directives"]).toEqual([
      "script-src",
    ]);
  });

  it("seedContentSecurityPolicyEnv writes all four slots unconditionally (Rails parity)", () => {
    const headers: Record<string, unknown> = {
      "action_dispatch.content_security_policy_report_only": true,
    };
    const req = {
      getHeader: (k: string) => headers[k],
      setHeader: (k: string, v: unknown) => (headers[k] = v),
    };
    // Defaults are all falsy — Rails copies them anyway (application.rb:344),
    // which must overwrite the stale `true` carried over from a prior request.
    Trailtie.seedContentSecurityPolicyEnv(req);
    expect(headers["action_dispatch.content_security_policy_report_only"]).toBe(false);
    expect(headers["action_dispatch.content_security_policy"]).toBeNull();
    expect(headers["action_dispatch.content_security_policy_nonce_generator"]).toBeNull();
    expect(headers["action_dispatch.content_security_policy_nonce_directives"]).toBeNull();
  });

  it("runInitializers resets Response.defaultCharset to utf-8 when cfg is null", () => {
    Response.defaultCharset = "stale";
    cfg().defaultCharset = null;
    Trailtie.runInitializers();
    expect(Response.defaultCharset).toBe("utf-8");
  });
});
