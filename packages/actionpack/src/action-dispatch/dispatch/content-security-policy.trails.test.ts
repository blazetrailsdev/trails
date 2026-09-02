/**
 * trails-only cover for the two things `ContentSecurityPolicy#report_uri`
 * (content_security_policy.rb:238-240) does NOT do, precisely because it is
 * the one directive writer that assigns `@directives` directly instead of
 * going through the `DIRECTIVES` loop (content_security_policy.rb:189-197):
 * it applies no `apply_mappings`, and it has no delete-on-nil arm.
 */
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
});
