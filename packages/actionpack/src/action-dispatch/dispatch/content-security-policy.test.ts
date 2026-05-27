import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { ContentSecurityPolicy, MAPPINGS } from "../content-security-policy.js";
import { IntegrationTest } from "../testing/integration.js";
import { Base } from "../../action-controller/base.js";
import type { AbstractController } from "../../abstract-controller/base.js";
import {
  type CspRequestHost,
  contentSecurityPolicy as cspFromRequest,
  contentSecurityPolicyNonce as cspNonceFromRequest,
  contentSecurityPolicyNonceDirectives as cspNonceDirectivesFromRequest,
  contentSecurityPolicyReportOnly as cspReportOnlyFromRequest,
} from "../http/content-security-policy.js";

describe("ContentSecurityPolicyTest", () => {
  it("build", () => {
    const policy = new ContentSecurityPolicy();
    policy.defaultSrc("'self'");
    expect(policy.build()).toBe("default-src 'self'");
  });

  it("dup", () => {
    const policy = new ContentSecurityPolicy();
    policy.defaultSrc("'self'");
    const copy = policy.dup();
    copy.scriptSrc("'unsafe-inline'");
    expect(policy.build()).toBe("default-src 'self'");
    expect(copy.build()).toContain("script-src");
  });

  it("semicolon validation", () => {
    const policy = new ContentSecurityPolicy();
    policy.defaultSrc("'self'; script-src 'unsafe-inline'");
    expect(() => policy.build()).toThrow(/semicolon/);
  });

  it("mappings", () => {
    const policy = new ContentSecurityPolicy();
    policy.defaultSrc("'self'");
    policy.scriptSrc("'self'", "cdn.example.com");
    const header = policy.build();
    expect(header).toContain("default-src 'self'");
    expect(header).toContain("script-src 'self' cdn.example.com");
  });

  it("fetch directives", () => {
    const policy = new ContentSecurityPolicy();
    policy.defaultSrc("'none'");
    policy.imgSrc("*");
    policy.fontSrc("https://fonts.example.com");
    const header = policy.build();
    expect(header).toContain("default-src 'none'");
    expect(header).toContain("img-src *");
    expect(header).toContain("font-src https://fonts.example.com");
  });

  it("document directives", () => {
    const policy = new ContentSecurityPolicy();
    policy.baseUri("'self'");
    policy.sandbox("allow-scripts");
    const header = policy.build();
    expect(header).toContain("base-uri 'self'");
    expect(header).toContain("sandbox allow-scripts");
  });

  it("navigation directives", () => {
    const policy = new ContentSecurityPolicy();
    policy.formAction("'self'");
    policy.frameAncestors("'none'");
    const header = policy.build();
    expect(header).toContain("form-action 'self'");
    expect(header).toContain("frame-ancestors 'none'");
  });

  it("reporting directives", () => {
    const policy = new ContentSecurityPolicy();
    policy.reportUri("/csp-report");
    policy.reportTo("default");
    const header = policy.build();
    expect(header).toContain("report-uri /csp-report");
    expect(header).toContain("report-to default");
  });

  it("other directives", () => {
    const policy = new ContentSecurityPolicy();
    policy.blockAllMixedContent();
    policy.upgradeInsecureRequests();
    const header = policy.build();
    expect(header).toContain("block-all-mixed-content");
    expect(header).toContain("upgrade-insecure-requests");
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
    policy.defaultSrc("'self'", "https://cdn.example.com", "https://api.example.com");
    expect(policy.build()).toBe(
      "default-src 'self' https://cdn.example.com https://api.example.com",
    );
  });

  it("multiple directives", () => {
    const policy = new ContentSecurityPolicy();
    policy.defaultSrc("'self'");
    policy.scriptSrc("cdn.example.com");
    policy.styleSrc("'unsafe-inline'");
    const header = policy.build();
    expect(header).toContain("default-src 'self'");
    expect(header).toContain("script-src cdn.example.com");
    expect(header).toContain("style-src 'unsafe-inline'");
    // Directives separated by semicolons
    expect(header.split("; ").length).toBe(3);
  });

  it("dynamic directives", () => {
    const policy = new ContentSecurityPolicy();
    policy.defaultSrc(() => "'self'");
    expect(policy.build({})).toBe("default-src 'self'");
  });

  it("multiple and dynamic directives", () => {
    const policy = new ContentSecurityPolicy();
    policy.defaultSrc("'self'");
    policy.scriptSrc(() => "cdn.example.com");
    const header = policy.build({});
    expect(header).toContain("default-src 'self'");
    expect(header).toContain("script-src cdn.example.com");
  });

  it("mixed static and dynamic directives", () => {
    const policy = new ContentSecurityPolicy();
    policy.defaultSrc("'self'", () => "dynamic.example.com");
    expect(policy.build({})).toBe("default-src 'self' dynamic.example.com");
  });

  it("missing context for dynamic source", () => {
    const policy = new ContentSecurityPolicy();
    policy.defaultSrc(() => "'self'");
    expect(() => policy.build()).toThrow(/Missing context/);
  });

  it("has directive check", () => {
    const policy = new ContentSecurityPolicy();
    policy.defaultSrc("'self'");
    expect(policy.hasDirective("default-src")).toBe(true);
    expect(policy.hasDirective("script-src")).toBe(false);
  });

  it("get directives returns copy", () => {
    const policy = new ContentSecurityPolicy();
    policy.defaultSrc("'self'");
    policy.scriptSrc("cdn.example.com");
    const dirs = policy.getDirectives();
    expect(dirs.size).toBe(2);
    expect(dirs.get("default-src")).toEqual(["'self'"]);
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

  it("navigate to directive", () => {
    const policy = new ContentSecurityPolicy();
    policy.navigateTo("'self'");
    expect(policy.build()).toBe("navigate-to 'self'");
  });

  it("require sri for directive", () => {
    const policy = new ContentSecurityPolicy();
    policy.requireSriFor("script", "style");
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

  // Rails: test_mappings — every MAPPINGS key resolves through a fetch
  // directive (content_security_policy_test.rb).
  it("mappings table is exhaustive", () => {
    for (const [key, expected] of Object.entries(MAPPINGS)) {
      const policy = new ContentSecurityPolicy();
      policy.defaultSrc(`:${key}`);
      expect(policy.build()).toBe(`default-src ${expected}`);
    }
  });

  // Rails: test_dynamic_directives — Proc returning Array<String> flattens.
  it("dynamic directive returning array of sources", () => {
    const policy = new ContentSecurityPolicy();
    policy.defaultSrc(() => ["https://a.example", "https://b.example"]);
    expect(policy.build({})).toBe("default-src https://a.example https://b.example");
  });

  // Rails: test_invalid_directive_source — non-string/non-proc raises.
  it("invalid directive source", () => {
    const policy = new ContentSecurityPolicy();
    expect(() => policy.defaultSrc(123 as unknown as string)).toThrow(/Invalid/);
  });

  // Rails: test_raises_runtime_error_when_unexpected_source — Proc returns
  // an unexpected (non-string) value.
  it("raises runtime error when unexpected source", () => {
    const policy = new ContentSecurityPolicy();
    policy.defaultSrc(() => 42 as unknown as string);
    expect(() => policy.build({})).toThrow(/Unexpected|Invalid/);
  });

  // Rails: DSL with no args deletes the directive (content_security_policy.rb:189).
  it("DSL with no args clears the directive", () => {
    const policy = new ContentSecurityPolicy();
    policy.scriptSrc("'self'");
    policy.scriptSrc();
    expect(policy.hasDirective("script-src")).toBe(false);
  });

  it("DSL with falsy first arg clears the directive", () => {
    const policy = new ContentSecurityPolicy();
    policy.scriptSrc("'self'");
    policy.scriptSrc(null);
    expect(policy.hasDirective("script-src")).toBe(false);
  });

  // Ruby truthiness: empty string stays truthy, so DSL with "" preserves the
  // directive (content_security_policy.rb:189-197).
  it("DSL with empty-string first arg keeps the directive (Ruby truthiness)", () => {
    const policy = new ContentSecurityPolicy();
    policy.scriptSrc("");
    expect(policy.hasDirective("script-src")).toBe(true);
  });

  // Bare directives store the `true` sentinel (Rails parity).
  it("block_all_mixed_content stores true sentinel", () => {
    const policy = new ContentSecurityPolicy();
    policy.blockAllMixedContent();
    expect(policy.getDirectives().get("block-all-mixed-content")).toBe(true);
  });

  it("upgrade_insecure_requests stores true sentinel", () => {
    const policy = new ContentSecurityPolicy();
    policy.upgradeInsecureRequests();
    expect(policy.getDirectives().get("upgrade-insecure-requests")).toBe(true);
  });

  it("sandbox with no args stores true sentinel", () => {
    const policy = new ContentSecurityPolicy();
    policy.sandbox();
    expect(policy.getDirectives().get("sandbox")).toBe(true);
    expect(policy.build()).toBe("sandbox");
  });

  // Rails: test_whitespace_validation — embedded whitespace raises.
  it("whitespace validation", () => {
    const policy = new ContentSecurityPolicy();
    policy.defaultSrc("foo bar");
    expect(() => policy.build()).toThrow(/whitespace or semicolons/);
  });

  it("dup preserves bare-directive sentinel", () => {
    const policy = new ContentSecurityPolicy();
    policy.upgradeInsecureRequests();
    const copy = policy.dup();
    expect(copy.getDirectives().get("upgrade-insecure-requests")).toBe(true);
    expect(copy.build()).toBe("upgrade-insecure-requests");
  });
});

// ==========================================================================
// Full-stack integration tests
// dispatch/content_security_policy_test.rb
// ==========================================================================

function resolvedCspHeader(app: IntegrationTest): string | null {
  if (app.response.status === 304) return null;
  const req = app.request as unknown as CspRequestHost;
  const policy = cspFromRequest.call(req);
  if (!policy) return null;
  const nonce = cspNonceFromRequest.call(req) ?? undefined;
  const dirs = cspNonceDirectivesFromRequest.call(req) ?? undefined;
  const context = app.controller ?? app.request;
  return policy.build(context, nonce, dirs);
}

function resolvedCspReportOnly(app: IntegrationTest): boolean {
  return !!cspReportOnlyFromRequest.call(app.request as unknown as CspRequestHost);
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
    this.render({ json: {} });
  }
  async notModified() {
    this.head("not_modified");
  }
}
CspIntegrationController.contentSecurityPolicy({ only: ["inline"] }, (p) => {
  p.defaultSrc("https://example.com");
});
CspIntegrationController.contentSecurityPolicy(
  {
    only: ["conditional"],
    if: [(c: AbstractController) => (c as CspIntegrationController).conditionTrue()],
  },
  (p) => {
    p.defaultSrc("https://true.example.com");
  },
);
CspIntegrationController.contentSecurityPolicy(
  {
    only: ["conditional"],
    unless: [(c: AbstractController) => (c as CspIntegrationController).conditionTrue()],
  },
  (p) => {
    p.defaultSrc("https://false.example.com");
  },
);
CspIntegrationController.contentSecurityPolicy({ only: ["reportOnly"] }, (p) => {
  p.reportUri("/violations");
});
CspIntegrationController.contentSecurityPolicyReportOnly({ only: ["reportOnly"] });
CspIntegrationController.contentSecurityPolicy({ only: ["scriptSrc"] }, (p) => {
  p.defaultSrc(false);
  p.scriptSrc(":self");
});
CspIntegrationController.contentSecurityPolicy({ only: ["styleSrc"] }, (p) => {
  p.defaultSrc(false);
  p.styleSrc(":self");
});
CspIntegrationController.contentSecurityPolicy(false, { only: ["noPolicy"] });
CspIntegrationController.contentSecurityPolicy({ only: ["api"] }, (p) => {
  p.defaultSrc(":none");
  p.frameAncestors(":none");
});

function buildCspApp() {
  const app = new IntegrationTest();
  app.routes.draw((r) => {
    r.get("/", { to: "csp#index" });
    r.get("/inline", { to: "csp#inline" });
    r.get("/conditional", { to: "csp#conditional" });
    r.get("/report-only", { to: "csp#reportOnly" });
    r.get("/script-src", { to: "csp#scriptSrc" });
    r.get("/style-src", { to: "csp#styleSrc" });
    r.get("/no-policy", { to: "csp#noPolicy" });
    r.get("/api", { to: "csp#api" });
    r.get("/not-modified", { to: "csp#notModified" });
  });
  app.registerController("csp", CspIntegrationController);
  return app;
}

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
    expect(resolvedCspHeader(app)).toBeNull();
  });

  it("generates api security policy", async () => {
    await app.get("/api", { env: cspEnv(GLOBAL_CSP_POLICY) });
    expect(resolvedCspHeader(app)).toBe("default-src 'none'; frame-ancestors 'none'");
  });

  it("generates no content security policy for not modified", async () => {
    await app.get("/not-modified", { env: cspEnv(GLOBAL_CSP_POLICY) });
    expect(app.response.status).toBe(304);
    expect(resolvedCspHeader(app)).toBeNull();
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
    expect(resolvedCspHeader(app)).toBeNull();
  });

  it("generates content security policy header when globally disabled", async () => {
    await app.get("/inline", { env: cspEnv(null) });
    // The before_action dupes a fresh policy when none is set on the request.
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

  it("redirect works with dynamic sources", async () => {
    const dynamicPolicy = new ContentSecurityPolicy((p) => {
      p.defaultSrc(() => ":self");
      p.scriptSrc(() => ":https");
    });
    const app = new IntegrationTest();
    app.routes.draw((r) => {
      r.get("/redirect", { to: "csp#redirect" });
      r.get("/", { to: "csp#index" });
    });

    class RedirectController extends Base {
      async redirect() {
        this.redirectTo("/");
      }
      async index() {
        this.head("ok");
      }
    }
    app.registerController("csp", RedirectController);

    await app.get("/redirect", { env: cspEnv(dynamicPolicy) });
    expect(app.response.status).toBe(302);
    const header = resolvedCspHeader(app);
    expect(header).toContain("default-src 'self'");
    expect(header).toContain("script-src https:");
  });
});

describe("NonceDirectiveContentSecurityPolicyIntegrationTest", () => {
  it("generate nonce only specified in nonce directives", async () => {
    const policy = new ContentSecurityPolicy((p) => {
      p.defaultSrc(() => ":self");
      p.scriptSrc(() => ":https");
      p.styleSrc(() => ":https");
    });
    const app = new IntegrationTest();
    app.routes.draw((r) => {
      r.get("/", { to: "csp#index" });
    });

    class NdController extends Base {
      async index() {
        this.head("ok");
      }
    }
    app.registerController("csp", NdController);

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
  it.skip("can call helper methods in csp", () => {
    // pending: trails does not yet expose a `helpers` proxy inside CSP blocks;
    // helper_method registration exists but the CSP before_action block
    // runs without a view-context binding.
  });
});
