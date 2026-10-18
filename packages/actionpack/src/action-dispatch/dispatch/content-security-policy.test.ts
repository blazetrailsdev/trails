import { describe, it, expect, afterAll, beforeAll, beforeEach } from "vitest";
import {
  ContentSecurityPolicy,
  InvalidDirectiveError,
  MAPPINGS,
} from "../http/content-security-policy.js";
import { Request } from "../http/request.js";
import { IntegrationTest } from "../testing/integration.js";
import "../../test-helpers/abstract-unit.js";
import { Base } from "../../action-controller/base.js";
import type { AbstractController } from "../../abstract-controller/base.js";
import {
  Lint,
  bodyFromString,
  MockRequest,
  type RackApp,
  type RackEnv,
  type RackResponse,
} from "@blazetrails/rack";
import { Middleware } from "../http/content-security-policy.js";
import { CONTENT_SECURITY_POLICY, CONTENT_SECURITY_POLICY_REPORT_ONLY } from "../constants.js";
import { controllerConstants } from "../http/request.js";
import {
  assertMatch,
  assertNil,
  assertNothingRaised,
  assertRaises,
} from "@blazetrails/activesupport";
import {
  ArgumentError,
  RuntimeError,
  rbObjDup,
  registerConstant,
  unregisterConstant,
} from "@blazetrails/ruby-compat";
import { Module } from "@blazetrails/ruby-compat/include";
import type { MiddlewareFactory } from "../middleware/stack.js";
import { RouteSet } from "../routing/route-set.js";

describe("ContentSecurityPolicyTest", () => {
  it("build", () => {
    const policy = new ContentSecurityPolicy();
    expect(policy.build()).toBe("");

    policy.scriptSrc(":self");
    expect(policy.build()).toBe("script-src 'self'");
  });

  it("dup", () => {
    const policy = new ContentSecurityPolicy();
    policy.imgSrc(":self");
    policy.blockAllMixedContent();
    policy.upgradeInsecureRequests();
    policy.sandbox();
    const copied = rbObjDup(policy);
    expect(policy.build()).toBe(copied.build());
  });

  it("semicolon validation", async () => {
    const policy = new ContentSecurityPolicy();
    policy.baseUri("https://some.url; script-src https://other.url");

    const error = await assertRaises([InvalidDirectiveError], {}, () => policy.build());
    expect(error.message).toBe(
      `Invalid Content Security Policy base-uri: "https://some.url; script-src https://other.url". ` +
        "Directive values must not contain whitespace or semicolons. " +
        "Please use multiple arguments or other directive methods instead.",
    );
  });

  it("mappings", () => {
    const policy = new ContentSecurityPolicy();
    policy.scriptSrc(":data");
    expect(policy.build()).toBe("script-src data:");

    policy.scriptSrc(":mediastream");
    expect(policy.build()).toBe("script-src mediastream:");

    policy.scriptSrc(":blob");
    expect(policy.build()).toBe("script-src blob:");

    policy.scriptSrc(":filesystem");
    expect(policy.build()).toBe("script-src filesystem:");

    policy.scriptSrc(":self");
    expect(policy.build()).toBe("script-src 'self'");

    policy.scriptSrc(":unsafe_inline");
    expect(policy.build()).toBe("script-src 'unsafe-inline'");

    policy.scriptSrc(":unsafe_eval");
    expect(policy.build()).toBe("script-src 'unsafe-eval'");

    policy.scriptSrc(":wasm_unsafe_eval");
    expect(policy.build()).toBe("script-src 'wasm-unsafe-eval'");

    policy.scriptSrc(":none");
    expect(policy.build()).toBe("script-src 'none'");

    policy.scriptSrc(":strict_dynamic");
    expect(policy.build()).toBe("script-src 'strict-dynamic'");

    policy.scriptSrc(":ws");
    expect(policy.build()).toBe("script-src ws:");

    policy.scriptSrc(":wss");
    expect(policy.build()).toBe("script-src wss:");

    policy.scriptSrc(":none", ":report_sample");
    expect(policy.build()).toBe("script-src 'none' 'report-sample'");

    policy.scriptSrc(":unsafe_hashes");
    expect(policy.build()).toBe("script-src 'unsafe-hashes'");
  });

  it("fetch directives", () => {
    const policy = new ContentSecurityPolicy();
    policy.childSrc(":self");
    expect(policy.build()).toMatch(/child-src 'self'/);

    policy.childSrc(false);
    expect(policy.build()).not.toMatch(/child-src/);

    policy.connectSrc(":self");
    expect(policy.build()).toMatch(/connect-src 'self'/);

    policy.connectSrc(false);
    expect(policy.build()).not.toMatch(/connect-src/);

    policy.defaultSrc(":self");
    expect(policy.build()).toMatch(/default-src 'self'/);

    policy.defaultSrc(false);
    expect(policy.build()).not.toMatch(/default-src/);

    policy.fontSrc(":self");
    expect(policy.build()).toMatch(/font-src 'self'/);

    policy.fontSrc(false);
    expect(policy.build()).not.toMatch(/font-src/);

    policy.frameSrc(":self");
    expect(policy.build()).toMatch(/frame-src 'self'/);

    policy.frameSrc(false);
    expect(policy.build()).not.toMatch(/frame-src/);

    policy.imgSrc(":self");
    expect(policy.build()).toMatch(/img-src 'self'/);

    policy.imgSrc(false);
    expect(policy.build()).not.toMatch(/img-src/);

    policy.manifestSrc(":self");
    expect(policy.build()).toMatch(/manifest-src 'self'/);

    policy.manifestSrc(false);
    expect(policy.build()).not.toMatch(/manifest-src/);

    policy.mediaSrc(":self");
    expect(policy.build()).toMatch(/media-src 'self'/);

    policy.mediaSrc(false);
    expect(policy.build()).not.toMatch(/media-src/);

    policy.objectSrc(":self");
    expect(policy.build()).toMatch(/object-src 'self'/);

    policy.objectSrc(false);
    expect(policy.build()).not.toMatch(/object-src/);

    policy.prefetchSrc(":self");
    expect(policy.build()).toMatch(/prefetch-src 'self'/);

    policy.prefetchSrc(false);
    expect(policy.build()).not.toMatch(/prefetch-src/);

    policy.scriptSrc(":self");
    expect(policy.build()).toMatch(/script-src 'self'/);

    policy.scriptSrc(false);
    expect(policy.build()).not.toMatch(/script-src/);

    policy.scriptSrcAttr(":self");
    expect(policy.build()).toMatch(/script-src-attr 'self'/);

    policy.scriptSrcAttr(false);
    expect(policy.build()).not.toMatch(/script-src-attr/);

    policy.scriptSrcElem(":self");
    expect(policy.build()).toMatch(/script-src-elem 'self'/);

    policy.scriptSrcElem(false);
    expect(policy.build()).not.toMatch(/script-src-elem/);

    policy.styleSrc(":self");
    expect(policy.build()).toMatch(/style-src 'self'/);

    policy.styleSrc(false);
    expect(policy.build()).not.toMatch(/style-src/);

    policy.styleSrcAttr(":self");
    expect(policy.build()).toMatch(/style-src-attr 'self'/);

    policy.styleSrcAttr(false);
    expect(policy.build()).not.toMatch(/style-src-attr/);

    policy.styleSrcElem(":self");
    expect(policy.build()).toMatch(/style-src-elem 'self'/);

    policy.styleSrcElem(false);
    expect(policy.build()).not.toMatch(/style-src-elem/);

    policy.workerSrc(":self");
    expect(policy.build()).toMatch(/worker-src 'self'/);

    policy.workerSrc(false);
    expect(policy.build()).not.toMatch(/worker-src/);
  });

  it("document directives", () => {
    const policy = new ContentSecurityPolicy();
    policy.baseUri("https://example.com");
    expect(policy.build()).toMatch(/base-uri https:\/\/example\.com/);

    policy.pluginTypes("application/x-shockwave-flash");
    expect(policy.build()).toMatch(/plugin-types application\/x-shockwave-flash/);

    policy.sandbox();
    expect(policy.build()).toMatch(/sandbox/);

    policy.sandbox("allow-scripts", "allow-modals");
    expect(policy.build()).toMatch(/sandbox allow-scripts allow-modals/);

    policy.sandbox(false);
    expect(policy.build()).not.toMatch(/sandbox/);
  });

  it("navigation directives", () => {
    const policy = new ContentSecurityPolicy();
    policy.formAction(":self");
    expect(policy.build()).toMatch(/form-action 'self'/);

    policy.frameAncestors(":self");
    expect(policy.build()).toMatch(/frame-ancestors 'self'/);
  });

  it("reporting directives", () => {
    const policy = new ContentSecurityPolicy();
    policy.reportUri("/violations");
    expect(policy.build()).toMatch(/report-uri \/violations/);
  });

  it("other directives", () => {
    const policy = new ContentSecurityPolicy();
    policy.blockAllMixedContent();
    expect(policy.build()).toMatch(/block-all-mixed-content/);

    policy.blockAllMixedContent(false);
    expect(policy.build()).not.toMatch(/block-all-mixed-content/);

    policy.requireSriFor(":script", ":style");
    expect(policy.build()).toMatch(/require-sri-for script style/);

    policy.requireSriFor("script", "style");
    expect(policy.build()).toMatch(/require-sri-for script style/);

    policy.requireSriFor();
    expect(policy.build()).not.toMatch(/require-sri-for/);

    policy.requireTrustedTypesFor(":script");
    expect(policy.build()).toMatch(/require-trusted-types-for 'script'/);

    policy.requireTrustedTypesFor();
    expect(policy.build()).not.toMatch(/require-trusted-types-for/);

    policy.trustedTypes(":none");
    expect(policy.build()).toMatch(/trusted-types 'none'/);

    policy.trustedTypes("foo", "bar");
    expect(policy.build()).toMatch(/trusted-types foo bar/);

    policy.trustedTypes("foo", "bar", ":allow_duplicates");
    expect(policy.build()).toMatch(/trusted-types foo bar 'allow-duplicates'/);

    policy.trustedTypes();
    expect(policy.build()).not.toMatch(/trusted-types/);

    policy.upgradeInsecureRequests();
    expect(policy.build()).toMatch(/upgrade-insecure-requests/);

    policy.upgradeInsecureRequests(false);
    expect(policy.build()).not.toMatch(/upgrade-insecure-requests/);
  });

  it("block_all_mixed_content false removes the directive", () => {
    const policy = new ContentSecurityPolicy();
    policy.blockAllMixedContent();
    policy.blockAllMixedContent(false);
    expect(policy.build()).not.toContain("block-all-mixed-content");
  });

  it("upgrade_insecure_requests false removes the directive", () => {
    const policy = new ContentSecurityPolicy();
    policy.upgradeInsecureRequests();
    policy.upgradeInsecureRequests(false);
    expect(policy.build()).not.toContain("upgrade-insecure-requests");
  });

  it("sandbox false removes the directive", () => {
    const policy = new ContentSecurityPolicy();
    policy.sandbox("allow-scripts");
    policy.sandbox(false);
    expect(policy.build()).not.toContain("sandbox");
  });

  it("plugin_types false removes the directive", () => {
    const policy = new ContentSecurityPolicy();
    policy.pluginTypes("application/x-shockwave-flash");
    policy.pluginTypes(false);
    expect(policy.build()).not.toContain("plugin-types");
  });

  it("multiple sources", () => {
    const policy = new ContentSecurityPolicy();
    policy.scriptSrc(":self", ":https");
    expect(policy.build()).toBe("script-src 'self' https:");
  });

  it("multiple directives", () => {
    const policy = new ContentSecurityPolicy();
    policy.scriptSrc(":self", ":https");
    policy.styleSrc(":self", ":https");
    expect(policy.build()).toBe("script-src 'self' https:; style-src 'self' https:");
  });

  it("dynamic directives", () => {
    const policy = new ContentSecurityPolicy();
    const request = new Request({ HTTP_HOST: "www.example.com" });
    const controller = { request };

    policy.scriptSrc(() => request.host);
    expect(policy.build(controller)).toBe("script-src www.example.com");
  });

  it("multiple and dynamic directives", () => {
    const policy = new ContentSecurityPolicy();
    const request = new Request({ HTTP_HOST: "www.example.com" });
    const controller = { request };

    policy.frameAncestors(() => [":self", "https://example.com"]);
    expect(policy.build(controller)).toBe("frame-ancestors 'self' https://example.com");
  });

  it("mixed static and dynamic directives", () => {
    const policy = new ContentSecurityPolicy();
    policy.scriptSrc(":self", () => "foo.com", "bar.com");
    const request = new Request({});
    const controller = { request };
    expect(policy.build(controller)).toBe("script-src 'self' foo.com bar.com");
  });

  it("missing context for dynamic source", async () => {
    const policy = new ContentSecurityPolicy();
    policy.scriptSrc((controller) => (controller as { request: Request }).request.host);

    const exception = await assertRaises([RuntimeError], {}, () => policy.build());

    expect(exception.message).toMatch(
      /^Missing context for the dynamic content security policy source:/,
    );
  });

  it("constructor with init function", () => {
    const policy = new ContentSecurityPolicy((p) => {
      p.defaultSrc("'self'");
      p.scriptSrc("cdn.example.com");
    });
    expect(policy.build()).toContain("default-src 'self'");
    expect(policy.build()).toContain("script-src cdn.example.com");
  });

  it("child src directive", () => {
    const policy = new ContentSecurityPolicy();
    policy.childSrc("'self'");
    expect(policy.build()).toBe("child-src 'self'");
  });

  it("connect src directive", () => {
    const policy = new ContentSecurityPolicy();
    policy.connectSrc("'self'", "wss://example.com");
    expect(policy.build()).toBe("connect-src 'self' wss://example.com");
  });

  it("worker src directive", () => {
    const policy = new ContentSecurityPolicy();
    policy.workerSrc("'self'");
    expect(policy.build()).toBe("worker-src 'self'");
  });

  it("media src directive", () => {
    const policy = new ContentSecurityPolicy();
    policy.mediaSrc("media.example.com");
    expect(policy.build()).toBe("media-src media.example.com");
  });

  it("object src directive", () => {
    const policy = new ContentSecurityPolicy();
    policy.objectSrc("'none'");
    expect(policy.build()).toBe("object-src 'none'");
  });

  it("frame src directive", () => {
    const policy = new ContentSecurityPolicy();
    policy.frameSrc("https://youtube.com");
    expect(policy.build()).toBe("frame-src https://youtube.com");
  });

  it("manifest src directive", () => {
    const policy = new ContentSecurityPolicy();
    policy.manifestSrc("'self'");
    expect(policy.build()).toBe("manifest-src 'self'");
  });

  it("require sri for directive", () => {
    const policy = new ContentSecurityPolicy();
    policy.requireSriFor(":script", ":style");
    expect(policy.build()).toBe("require-sri-for script style");
  });

  it("symbol-source mappings", () => {
    const policy = new ContentSecurityPolicy();
    policy.defaultSrc(":self", ":https");
    policy.scriptSrc(":self", ":unsafe_eval", ":strict_dynamic");
    policy.imgSrc(":self", ":data", ":blob");
    policy.objectSrc(":none");
    const header = policy.build();
    expect(header).toContain("default-src 'self' https:");
    expect(header).toContain("script-src 'self' 'unsafe-eval' 'strict-dynamic'");
    expect(header).toContain("img-src 'self' data: blob:");
    expect(header).toContain("object-src 'none'");
  });

  it("symbol-source mappings table", () => {
    expect(MAPPINGS.self).toBe("'self'");
    expect(MAPPINGS.https).toBe("https:");
    expect(MAPPINGS.none).toBe("'none'");
    expect(MAPPINGS.unsafe_inline).toBe("'unsafe-inline'");
  });

  it("unknown symbol-source raises", () => {
    const policy = new ContentSecurityPolicy();
    expect(() => policy.defaultSrc(":bogus")).toThrow(/Unknown content security policy source/);
  });

  it("non-symbol strings pass through unchanged", () => {
    const policy = new ContentSecurityPolicy();
    policy.scriptSrc("https://cdn.example.com", "'sha256-abc123'");
    expect(policy.build()).toBe("script-src https://cdn.example.com 'sha256-abc123'");
  });

  it("trusted types directive", () => {
    const policy = new ContentSecurityPolicy();
    policy.trustedTypes("default");
    expect(policy.build()).toBe("trusted-types default");
  });

  it("mappings table is exhaustive", () => {
    for (const [key, expected] of Object.entries(MAPPINGS)) {
      const policy = new ContentSecurityPolicy();
      policy.defaultSrc(`:${key}`);
      expect(policy.build()).toBe(`default-src ${expected}`);
    }
  });

  it("dynamic directive returning array of sources", () => {
    const policy = new ContentSecurityPolicy();
    policy.defaultSrc(() => ["https://a.example", "https://b.example"]);
    expect(policy.build({})).toBe("default-src https://a.example https://b.example");
  });

  it("invalid directive source", async () => {
    const policy = new ContentSecurityPolicy();
    const exception = await assertRaises([ArgumentError], {}, () =>
      policy.scriptSrc([":self"] as unknown as string),
    );

    expect(exception.message).toBe("Invalid content security policy source: [:self]");
  });

  it("raises runtime error when unexpected source", async () => {
    const policy = new ContentSecurityPolicy();
    policy.pluginTypes([":flash"] as unknown as string);

    const exception = await assertRaises([RuntimeError], {}, () => policy.build());

    expect(exception.message).toMatch(/^Unexpected content security policy source:/);
  });

  it("DSL with no args clears the directive", () => {
    const policy = new ContentSecurityPolicy();
    policy.scriptSrc("'self'");
    policy.scriptSrc();
    expect("script-src" in policy.directives).toBe(false);
  });

  it("DSL with falsy first arg clears the directive", () => {
    const policy = new ContentSecurityPolicy();
    policy.scriptSrc("'self'");
    policy.scriptSrc(null);
    expect("script-src" in policy.directives).toBe(false);
  });

  it("DSL with empty-string first arg keeps the directive (Ruby truthiness)", () => {
    const policy = new ContentSecurityPolicy();
    policy.scriptSrc("");
    expect("script-src" in policy.directives).toBe(true);
  });

  it("block_all_mixed_content stores true sentinel", () => {
    const policy = new ContentSecurityPolicy();
    policy.blockAllMixedContent();
    expect(policy.directives["block-all-mixed-content"]).toBe(true);
  });

  it("upgrade_insecure_requests stores true sentinel", () => {
    const policy = new ContentSecurityPolicy();
    policy.upgradeInsecureRequests();
    expect(policy.directives["upgrade-insecure-requests"]).toBe(true);
  });

  it("sandbox with no args stores true sentinel", () => {
    const policy = new ContentSecurityPolicy();
    policy.sandbox();
    expect(policy.directives["sandbox"]).toBe(true);
    expect(policy.build()).toBe("sandbox");
  });

  it("whitespace validation", async () => {
    const policy = new ContentSecurityPolicy();
    policy.baseUri("https://some.url https://other.url");

    const error = await assertRaises([InvalidDirectiveError], {}, () => policy.build());
    expect(error.message).toBe(
      `Invalid Content Security Policy base-uri: "https://some.url https://other.url". ` +
        "Directive values must not contain whitespace or semicolons. " +
        "Please use multiple arguments or other directive methods instead.",
    );
  });

  it("dup preserves bare-directive sentinel", () => {
    const policy = new ContentSecurityPolicy();
    policy.upgradeInsecureRequests();
    const copy = rbObjDup(policy);
    expect(copy.directives["upgrade-insecure-requests"]).toBe(true);
    expect(copy.build()).toBe("upgrade-insecure-requests");
  });
});

function resolvedCspHeader(app: IntegrationTest): string | null {
  if (app.response.status === 304) return null;
  const req = app.request;
  const policy = req.contentSecurityPolicy;
  if (!policy) return null;
  const nonce = req.contentSecurityPolicyNonce ?? undefined;
  const dirs = req.contentSecurityPolicyNonceDirectives ?? undefined;
  const context = app.controller ?? app.request;
  return policy.build(context, nonce, dirs);
}

function resolvedCspReportOnly(app: IntegrationTest): boolean {
  return !!app.request.contentSecurityPolicyReportOnly;
}

const NONCE_GENERATOR = () => "iyhD0Yc0W+c=";
const GLOBAL_CSP_POLICY = new ContentSecurityPolicy((p) => {
  p.defaultSrc(":self");
});

class CspIntegrationController extends Base {
  conditionTrue() {
    return this.params.get("condition") === "true";
  }
  async index() {
    this.head("ok");
  }
  async inline() {
    this.head("ok");
  }
  async conditional() {
    this.head("ok");
  }
  async reportOnly() {
    this.head("ok");
  }
  async scriptSrc() {
    this.head("ok");
  }
  async styleSrc() {
    this.head("ok");
  }
  async noPolicy() {
    this.head("ok");
  }
  async api() {
    await this.render({ json: {} });
  }
  async notModified() {
    this.head("not_modified");
  }
}
CspIntegrationController.contentSecurityPolicy(undefined, { only: ["inline"] }, (p) => {
  p.defaultSrc("https://example.com");
});
CspIntegrationController.contentSecurityPolicy(
  undefined,
  {
    only: ["conditional"],
    if: [(c: AbstractController) => (c as CspIntegrationController).conditionTrue()],
  },
  (p) => {
    p.defaultSrc("https://true.example.com");
  },
);
CspIntegrationController.contentSecurityPolicy(
  undefined,
  {
    only: ["conditional"],
    unless: [(c: AbstractController) => (c as CspIntegrationController).conditionTrue()],
  },
  (p) => {
    p.defaultSrc("https://false.example.com");
  },
);
CspIntegrationController.contentSecurityPolicy(undefined, { only: ["reportOnly"] }, (p) => {
  p.reportUri("/violations");
});
CspIntegrationController.contentSecurityPolicyReportOnly(undefined, { only: ["reportOnly"] });
CspIntegrationController.contentSecurityPolicy(undefined, { only: ["scriptSrc"] }, (p) => {
  p.defaultSrc(false);
  p.scriptSrc(":self");
});
CspIntegrationController.contentSecurityPolicy(undefined, { only: ["styleSrc"] }, (p) => {
  p.defaultSrc(false);
  p.styleSrc(":self");
});
CspIntegrationController.contentSecurityPolicy(false, { only: ["noPolicy"] });
CspIntegrationController.contentSecurityPolicy(undefined, { only: ["api"] }, (p) => {
  p.defaultSrc(":none");
  p.frameAncestors(":none");
});

function buildCspApp() {
  const app = new IntegrationTest(expect.getState().currentTestName!);
  app.routes.draw(function () {
    this.get("/", { to: "csp#index" });
    this.get("/inline", { to: "csp#inline" });
    this.get("/conditional", { to: "csp#conditional" });
    this.get("/report-only", { to: "csp#reportOnly" });
    this.get("/script-src", { to: "csp#scriptSrc" });
    this.get("/style-src", { to: "csp#styleSrc" });
    this.get("/no-policy", { to: "csp#noPolicy" });
    this.get("/api", { to: "csp#api" });
    this.get("/not-modified", { to: "csp#notModified" });
  });
  app.app = IntegrationTest.buildApp(app.routes);
  controllerConstants.set("csp", CspIntegrationController);
  return app;
}

describe("ContentSecurityPolicyMiddlewareTest", () => {
  function buildApp(app: RackApp): Lint {
    const inner = new Lint(app);
    const middleware = new Middleware((e) => inner.call(e));
    return new Lint((e) => middleware.call(e));
  }
  let env: RackEnv;
  let defaultCsp: string;

  beforeEach(() => {
    env = MockRequest.envFor("", {});
    env["action_dispatch.content_security_policy"] = new ContentSecurityPolicy((p) => {
      p.defaultSrc(() => ":self");
    });
    env["action_dispatch.content_security_policy_nonce_generator"] = () => "iyhD0Yc0W+c=";
    env["action_dispatch.content_security_policy_report_only"] = false;
    env["action_dispatch.show_exceptions"] = ":none";

    defaultCsp = "default-src 'self' https: http:";
  });

  it("rack lint", async () => {
    const app = async (): Promise<RackResponse> => [200, {}, bodyFromString("")];

    await assertNothingRaised(() => buildApp(app).call(env));
  });

  it("does not override app content security policy", async () => {
    const app = async (): Promise<RackResponse> => [
      200,
      { [CONTENT_SECURITY_POLICY]: defaultCsp },
      bodyFromString(""),
    ];
    const [, headers] = await buildApp(app).call(env);

    expect(headers[CONTENT_SECURITY_POLICY]).toBe(defaultCsp);
  });

  it("does not override app content security policy report only", async () => {
    const app = async (): Promise<RackResponse> => [
      200,
      { [CONTENT_SECURITY_POLICY_REPORT_ONLY]: defaultCsp },
      bodyFromString(""),
    ];
    env["action_dispatch.content_security_policy_report_only"] = true;
    const [, headers] = await buildApp(app).call(env);

    expect(headers[CONTENT_SECURITY_POLICY_REPORT_ONLY]).toBe(defaultCsp);
  });
});

function cspEnv(policy: ContentSecurityPolicy | null, extra: Record<string, unknown> = {}) {
  return {
    "action_dispatch.content_security_policy": policy,
    "action_dispatch.content_security_policy_nonce_generator": NONCE_GENERATOR,
    "action_dispatch.content_security_policy_report_only": false,
    ...extra,
  };
}

describe("ContentSecurityPolicyIntegrationTest", () => {
  let app: IntegrationTest;

  beforeAll(() => {
    app = buildCspApp();
  });

  beforeEach(() => app.resetBang());

  it("generates content security policy header", async () => {
    await app.get("/", { env: cspEnv(GLOBAL_CSP_POLICY) });
    expect(app.response.status).toBe(200);
    const header = resolvedCspHeader(app);
    expect(header).toBe("default-src 'self'");
    expect(resolvedCspReportOnly(app)).toBe(false);
  });

  it("generates inline content security policy", async () => {
    await app.get("/inline", { env: cspEnv(GLOBAL_CSP_POLICY) });
    const header = resolvedCspHeader(app);
    expect(header).toBe("default-src https://example.com");
  });

  it("generates conditional content security policy", async () => {
    await app.get("/conditional", {
      env: cspEnv(GLOBAL_CSP_POLICY),
      params: { condition: "true" },
    });
    expect(resolvedCspHeader(app)).toBe("default-src https://true.example.com");

    await app.get("/conditional", {
      env: cspEnv(GLOBAL_CSP_POLICY),
      params: { condition: "false" },
    });
    expect(resolvedCspHeader(app)).toBe("default-src https://false.example.com");
  });

  it("generates report only content security policy", async () => {
    await app.get("/report-only", { env: cspEnv(GLOBAL_CSP_POLICY) });
    expect(resolvedCspHeader(app)).toBe("default-src 'self'; report-uri /violations");
    expect(resolvedCspReportOnly(app)).toBe(true);
  });

  it("adds nonce to script src content security policy", async () => {
    await app.get("/script-src", { env: cspEnv(GLOBAL_CSP_POLICY) });
    expect(resolvedCspHeader(app)).toBe("script-src 'self' 'nonce-iyhD0Yc0W+c='");
  });

  it("adds nonce to style src content security policy", async () => {
    await app.get("/style-src", { env: cspEnv(GLOBAL_CSP_POLICY) });
    expect(resolvedCspHeader(app)).toBe("style-src 'self' 'nonce-iyhD0Yc0W+c='");
  });

  it("generates no content security policy", async () => {
    await app.get("/no-policy", { env: cspEnv(GLOBAL_CSP_POLICY) });
    assertNil(resolvedCspHeader(app));
  });

  it("generates api security policy", async () => {
    await app.get("/api", { env: cspEnv(GLOBAL_CSP_POLICY) });
    expect(resolvedCspHeader(app)).toBe("default-src 'none'; frame-ancestors 'none'");
  });

  it("generates no content security policy for not modified", async () => {
    await app.get("/not-modified", { env: cspEnv(GLOBAL_CSP_POLICY) });
    expect(app.response.status).toBe(304);
    assertNil(resolvedCspHeader(app));
  });
});

describe("DisabledContentSecurityPolicyIntegrationTest", () => {
  let app: IntegrationTest;

  beforeAll(() => {
    app = buildCspApp();
  });

  beforeEach(() => app.resetBang());

  it("generates no content security policy by default", async () => {
    await app.get("/", { env: cspEnv(null) });
    assertNil(resolvedCspHeader(app));
  });

  it("generates content security policy header when globally disabled", async () => {
    await app.get("/inline", { env: cspEnv(null) });
    expect(resolvedCspHeader(app)).toBe("default-src https://example.com");
  });
});

describe("DefaultContentSecurityPolicyIntegrationTest", () => {
  it("adds nonce to script src content security policy only once", async () => {
    const dynamicPolicy = new ContentSecurityPolicy((p) => {
      p.defaultSrc(() => ":self");
      p.scriptSrc(() => ":https");
    });
    const app = buildCspApp();
    await app.get("/", { env: cspEnv(dynamicPolicy) });
    await app.get("/", { env: cspEnv(dynamicPolicy) });
    expect(app.response.status).toBe(200);
    expect(resolvedCspHeader(app)).toBe(
      "default-src 'self'; script-src https: 'nonce-iyhD0Yc0W+c='",
    );
  });

  it("redirect works with dynamic sources", async ({ task }) => {
    const dynamicPolicy = new ContentSecurityPolicy((p) => {
      p.defaultSrc(() => ":self");
      p.scriptSrc(() => ":https");
    });
    const app = new IntegrationTest(task.name);
    app.routes.draw(function () {
      this.get("/redirect", { to: "csp#redirect" });
      this.get("/", { to: "csp#index" });
    });
    app.app = IntegrationTest.buildApp(app.routes);

    class RedirectController extends Base {
      async redirect() {
        this.redirectTo("/");
      }
      async index() {
        this.head("ok");
      }
    }
    controllerConstants.set("csp", RedirectController);

    await app.get("/redirect", { env: cspEnv(dynamicPolicy) });
    expect(app.response.status).toBe(302);
    const header = resolvedCspHeader(app);
    expect(header).toContain("default-src 'self'");
    expect(header).toContain("script-src https:");
  });
});

describe("NonceDirectiveContentSecurityPolicyIntegrationTest", () => {
  it("generate nonce only specified in nonce directives", async ({ task }) => {
    const policy = new ContentSecurityPolicy((p) => {
      p.defaultSrc(() => ":self");
      p.scriptSrc(() => ":https");
      p.styleSrc(() => ":https");
    });
    const app = new IntegrationTest(task.name);
    app.routes.draw(function () {
      this.get("/", { to: "csp#index" });
    });
    app.app = IntegrationTest.buildApp(app.routes);

    class NdController extends Base {
      async index() {
        this.head("ok");
      }
    }
    controllerConstants.set("csp", NdController);

    await app.get("/", {
      env: cspEnv(policy, {
        "action_dispatch.content_security_policy_nonce_directives": ["script-src"],
      }),
    });

    const header = resolvedCspHeader(app);
    expect(header).toMatch(/script-src https: 'nonce-/);
    expect(header).not.toMatch(/style-src https: 'nonce-/);
  });
});

describe("HelpersContentSecurityPolicyIntegrationTest", () => {
  type Probe = Record<string, () => boolean>;

  const ApplicationHelper = new Module().include({
    isPigsCanFly() {
      return false;
    },
  });
  registerConstant("ApplicationHelper", ApplicationHelper);
  afterAll(() => unregisterConstant("ApplicationHelper", ApplicationHelper));

  class ApplicationController extends Base {
    static {
      this.helperMethod("isSkyIsBlue");
    }
    isSkyIsBlue() {
      return true;
    }
  }

  class PolicyController extends ApplicationController {
    static {
      this.contentSecurityPolicy(undefined, undefined, function (this: unknown, p) {
        const helpers = (this as PolicyController).helpers() as unknown as Probe;
        p.defaultSrc("https://example.com");
        if (helpers.isSkyIsBlue()) p.scriptSrc("https://example.com");
        if (!helpers.isPigsCanFly()) p.styleSrc("https://example.com");
      });
    }

    async index() {
      this.head("ok");
    }
  }

  const ROUTES = new RouteSet();
  ROUTES.draw(function () {
    this.scope({ module: "helpers_content_security_policy_integration_test" }, () => {
      this.get("/", { to: "policy#index" });
    });
  });
  controllerConstants.set(
    "helpers_content_security_policy_integration_test/policy",
    PolicyController,
  );

  const POLICY = new ContentSecurityPolicy((p) => {
    p.defaultSrc(() => ":self");
    p.scriptSrc(() => ":https");
    p.styleSrc(() => ":https");
  });

  class PolicyConfigMiddleware {
    constructor(private app: { call(env: RackEnv): Promise<RackResponse> | RackResponse }) {}

    call(env: RackEnv): Promise<RackResponse> | RackResponse {
      env["action_dispatch.content_security_policy"] = POLICY;
      env["action_dispatch.content_security_policy_nonce_generator"] = () => "iyhD0Yc0W+c=";
      env["action_dispatch.content_security_policy_report_only"] = false;
      env["action_dispatch.show_exceptions"] = "none";

      return this.app.call(env);
    }
  }

  const APP = IntegrationTest.buildApp(ROUTES, (middleware) => {
    middleware.use(Lint as unknown as MiddlewareFactory);
    middleware.use(PolicyConfigMiddleware as unknown as MiddlewareFactory);
    middleware.use(Middleware as unknown as MiddlewareFactory);
    middleware.use(Lint as unknown as MiddlewareFactory);
  });

  it("can call helper methods in csp", async ({ task }) => {
    const testCase = new IntegrationTest(task.name);
    testCase.app = APP;
    await testCase.get("/");

    testCase.assertResponse("success");
    assertMatch(
      "default-src https://example.com",
      testCase.response.headers.get(CONTENT_SECURITY_POLICY)!,
    );
    assertMatch(
      "script-src https://example.com",
      testCase.response.headers.get(CONTENT_SECURITY_POLICY)!,
    );
    assertMatch(
      "style-src https://example.com",
      testCase.response.headers.get(CONTENT_SECURITY_POLICY)!,
    );
  });
});
