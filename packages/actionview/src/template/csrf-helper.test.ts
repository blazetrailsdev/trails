import { describe, it } from "vitest";
import { include } from "@blazetrails/ruby-compat";
import { CsrfHelper, type csrfMetaTags } from "../helpers/csrf-helper.js";
import { TagHelper } from "../helpers/tag-helper.js";
import { assertDomEqual } from "../testing/dom-assertions.js";

class CsrfHelperTest {
  static requestForgery = false;

  declare csrfMetaTags: OmitThisParameter<typeof csrfMetaTags>;

  isProtectAgainstForgery(): boolean {
    return CsrfHelperTest.requestForgery;
  }

  formAuthenticityToken(): string {
    return "secret";
  }

  get requestForgeryProtectionToken(): string {
    return "form_token";
  }
}
include(CsrfHelperTest, CsrfHelper);
include(CsrfHelperTest, TagHelper);

describe("CsrfHelperTest", () => {
  it("csrf meta tags without request forgery protection", () => {
    const test = new CsrfHelperTest();
    assertDomEqual("", test.csrfMetaTags());
  });

  it("csrf meta tags with request forgery protection", () => {
    const test = new CsrfHelperTest();
    CsrfHelperTest.requestForgery = true;
    try {
      assertDomEqual(
        '<meta name="csrf-param" content="form_token" />\n<meta name="csrf-token" content="secret" />',
        test.csrfMetaTags(),
      );
    } finally {
      CsrfHelperTest.requestForgery = false;
    }
  });

  it("csrf meta tags without protect against forgery method", () => {
    const test = new CsrfHelperTest();
    const { isProtectAgainstForgery } = CsrfHelperTest.prototype;
    delete (CsrfHelperTest.prototype as Partial<CsrfHelperTest>).isProtectAgainstForgery;
    try {
      assertDomEqual("", test.csrfMetaTags());
    } finally {
      CsrfHelperTest.prototype.isProtectAgainstForgery = isProtectAgainstForgery;
    }
  });
});
