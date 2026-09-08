import { describe, it, expect } from "vitest";
import { ContentSecurityPolicy } from "../http/content-security-policy.js";

describe("ContentSecurityPolicyTest", () => {
  it("report_uri emits a mapping keyword verbatim", () => {
    const policy = new ContentSecurityPolicy();
    policy.reportUri(":self");
    expect(policy.build()).toBe("report-uri :self");
  });

  it("report_uri stores a nil uri instead of deleting the directive", () => {
    const policy = new ContentSecurityPolicy();
    policy.reportUri(null as unknown as string);
    expect(() => policy.build()).toThrow("Unexpected content security policy source: null");
  });

  it("plugin_types emits a mapping keyword verbatim", () => {
    const policy = new ContentSecurityPolicy();
    policy.pluginTypes(":self");
    expect(policy.build()).toBe("plugin-types :self");
  });

  it("sandbox emits a mapping keyword verbatim", () => {
    const policy = new ContentSecurityPolicy();
    policy.sandbox(":self");
    expect(policy.build()).toBe("sandbox :self");
  });
});
