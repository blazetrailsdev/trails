import { describe, expect, it } from "vitest";
import { include } from "@blazetrails/ruby-compat";
import { CspHelper, type cspMetaTag } from "../helpers/csp-helper.js";
import { TagHelper } from "../helpers/tag-helper.js";

class CspHelperWithCspEnabledTest {
  declare cspMetaTag: OmitThisParameter<typeof cspMetaTag>;

  contentSecurityPolicyNonce(): string {
    return "iyhD0Yc0W+c=";
  }

  isContentSecurityPolicy(): boolean {
    return true;
  }
}
include(CspHelperWithCspEnabledTest, CspHelper);
include(CspHelperWithCspEnabledTest, TagHelper);

class CspHelperWithCspDisabledTest {
  declare cspMetaTag: OmitThisParameter<typeof cspMetaTag>;

  contentSecurityPolicyNonce(): string | null {
    return null;
  }

  isContentSecurityPolicy(): boolean {
    return false;
  }
}
include(CspHelperWithCspDisabledTest, CspHelper);
include(CspHelperWithCspDisabledTest, TagHelper);

describe("CspHelperWithCspEnabledTest", () => {
  it("csp meta tag", () => {
    expect(String(new CspHelperWithCspEnabledTest().cspMetaTag())).toBe(
      '<meta name="csp-nonce" content="iyhD0Yc0W+c=" />',
    );
  });

  it("csp meta tag with options", () => {
    expect(String(new CspHelperWithCspEnabledTest().cspMetaTag({ property: "csp-nonce" }))).toBe(
      '<meta property="csp-nonce" name="csp-nonce" content="iyhD0Yc0W+c=" />',
    );
  });
});

describe("CspHelperWithCspDisabledTest", () => {
  it("csp meta tag", () => {
    expect(new CspHelperWithCspDisabledTest().cspMetaTag()).toBeNull();
  });
});
