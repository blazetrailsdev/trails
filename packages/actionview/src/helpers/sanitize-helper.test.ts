import { afterEach, describe, expect, it } from "vitest";
import {
  SanitizeHelper,
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
    expect(SanitizeHelper.fullSanitizer).toBe(getFullSanitizer());
    expect(SanitizeHelper.linkSanitizer).toBe(getLinkSanitizer());
    expect(SanitizeHelper.safeListSanitizer).toBe(getSafeListSanitizer());
    expect(SanitizeHelper.sanitizerVendor).toBe(getSanitizerVendor());
  });

  it("writers replace the underlying instance seen by get* functions", () => {
    const full = stub("full");
    const link = stub("link");
    const safe = stub("safe");

    SanitizeHelper.fullSanitizer = full;
    SanitizeHelper.linkSanitizer = link;
    SanitizeHelper.safeListSanitizer = safe;

    expect(getFullSanitizer()).toBe(full);
    expect(getLinkSanitizer()).toBe(link);
    expect(getSafeListSanitizer()).toBe(safe);
    expect(SanitizeHelper.fullSanitizer).toBe(full);
  });
});
