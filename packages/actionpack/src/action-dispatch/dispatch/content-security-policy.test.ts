import { describe, it, expect } from "vitest";
import { ContentSecurityPolicy, MAPPINGS } from "../content-security-policy.js";

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
  it("invalid directive source raises", () => {
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

describe("ContentSecurityPolicyIntegrationTest", () => {
  it("adds nonce to script src content security policy", () => {
    const policy = new ContentSecurityPolicy();
    policy.scriptSrc("'self'");
    const header = policy.build(undefined, "abc123");
    expect(header).toContain("'nonce-abc123'");
  });

  it("adds nonce to style src content security policy", () => {
    const policy = new ContentSecurityPolicy();
    policy.styleSrc("'self'");
    const header = policy.build(undefined, "xyz789");
    expect(header).toContain("'nonce-xyz789'");
  });

  it("generates no content security policy", () => {
    const policy = new ContentSecurityPolicy();
    expect(policy.build()).toBe("");
  });
});

describe("DefaultContentSecurityPolicyIntegrationTest", () => {
  it("adds nonce to script src content security policy only once", () => {
    const policy = new ContentSecurityPolicy();
    policy.scriptSrc("'self'");
    const header = policy.build(undefined, "abc123");
    const matches = header.match(/nonce-abc123/g);
    expect(matches?.length).toBe(1);
  });
});
