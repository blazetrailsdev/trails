import { describe, it, expect } from "vitest";
import { ContentSecurityPolicy } from "./content-security-policy.js";

describe("ActionDispatch::ContentSecurityPolicy", () => {
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

  it("multiple sources", () => {
    const policy = new ContentSecurityPolicy();
    policy.defaultSrc("'self'", "https://cdn.example.com", "https://api.example.com");
    expect(policy.build()).toBe("default-src 'self' https://cdn.example.com https://api.example.com");
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

  it("adds nonce to script src content security policy", () => {
    const policy = new ContentSecurityPolicy();
    policy.scriptSrc("'self'");
    const header = policy.build(undefined, "abc123");
    expect(header).toContain("'nonce-abc123'");
  });

  it("adds nonce to script src content security policy only once", () => {
    const policy = new ContentSecurityPolicy();
    policy.scriptSrc("'self'");
    const header = policy.build(undefined, "abc123");
    const matches = header.match(/nonce-abc123/g);
    expect(matches?.length).toBe(1);
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

  it("trusted types directive", () => {
    const policy = new ContentSecurityPolicy();
    policy.trustedTypes("default");
    expect(policy.build()).toBe("trusted-types default");
  });
});
