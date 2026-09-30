import { afterEach, describe, expect, it } from "vitest";
import {
  ClassMethods,
  getFullSanitizer,
  getLinkSanitizer,
  getSafeListSanitizer,
  getSanitizerVendor,
  setFullSanitizer,
  setLinkSanitizer,
  setSafeListSanitizer,
  setSanitizerVendor,
  type Sanitizer,
} from "./sanitize-helper.js";

const baseline = {
  vendor: getSanitizerVendor(),
  full: getFullSanitizer(),
  link: getLinkSanitizer(),
  safeList: getSafeListSanitizer(),
};

afterEach(() => {
  setSanitizerVendor(baseline.vendor);
  setFullSanitizer(baseline.full);
  setLinkSanitizer(baseline.link);
  setSafeListSanitizer(baseline.safeList);
});

describe("SanitizeHelper class accessors", () => {
  const stub = (label: string): Sanitizer => ({
    sanitize: (html) => `[${label}:${html ?? ""}]`,
  });

  it("readers return the memoized module-level instances", () => {
    expect(ClassMethods.fullSanitizer).toBe(getFullSanitizer());
    expect(ClassMethods.linkSanitizer).toBe(getLinkSanitizer());
    expect(ClassMethods.safeListSanitizer).toBe(getSafeListSanitizer());
    expect(ClassMethods.sanitizerVendor).toBe(getSanitizerVendor());
  });

  it("writers replace the underlying instance seen by get* functions", () => {
    const full = stub("full");
    const link = stub("link");
    const safe = stub("safe");

    ClassMethods.fullSanitizer = full;
    ClassMethods.linkSanitizer = link;
    ClassMethods.safeListSanitizer = safe;

    expect(getFullSanitizer()).toBe(full);
    expect(getLinkSanitizer()).toBe(link);
    expect(getSafeListSanitizer()).toBe(safe);
    expect(ClassMethods.fullSanitizer).toBe(full);
  });
});
