import { describe, expect, it } from "vitest";
import { Base } from "../base.js";
import { SanitizeHelper, type SanitizeHelperClass } from "./sanitize-helper.js";

describe("SanitizeHelper class accessors", () => {
  it("reach ActionView::Base through the Concern's ClassMethods", () => {
    const klass = Base as unknown as SanitizeHelperClass;
    expect(klass.sanitizerVendor).toBe(SanitizeHelper.sanitizerVendor);
    expect(klass.fullSanitizer).toBe(klass.fullSanitizer);
    expect(klass.fullSanitizer).toBeInstanceOf(SanitizeHelper.sanitizerVendor.fullSanitizer);
  });

  it("memoize per including class", () => {
    const subclass = class extends Base {} as unknown as SanitizeHelperClass;
    expect(subclass.linkSanitizer).not.toBe((Base as unknown as SanitizeHelperClass).linkSanitizer);
  });
});
