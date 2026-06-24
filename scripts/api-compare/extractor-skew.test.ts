import { describe, expect, it } from "vitest";

import type { ApiManifest } from "./types.js";
import { describeExtractorSkew, detectExtractorSkew } from "./extractor-skew.js";

function man(extractorHash: string | undefined): ApiManifest {
  return { source: "ruby", generatedAt: "now", extractorHash, packages: {} };
}

describe("detectExtractorSkew", () => {
  it("reports no skew when both extractor hashes match", () => {
    const skew = detectExtractorSkew(man("abcd1234"), man("abcd1234"));
    expect(skew).toEqual({ skewed: false, baseHash: "abcd1234", targetHash: "abcd1234" });
  });

  it("reports skew when the extractor hashes differ", () => {
    const skew = detectExtractorSkew(man("abcd1234"), man("ef567890"));
    expect(skew.skewed).toBe(true);
    expect(skew.baseHash).toBe("abcd1234");
    expect(skew.targetHash).toBe("ef567890");
  });

  it("treats a missing base hash (pre-field manifest) as skew", () => {
    expect(detectExtractorSkew(man(undefined), man("abcd1234")).skewed).toBe(true);
  });

  it("treats a missing target hash as skew", () => {
    expect(detectExtractorSkew(man("abcd1234"), man(undefined)).skewed).toBe(true);
  });
});

describe("describeExtractorSkew", () => {
  it("names both extractor hashes", () => {
    const msg = describeExtractorSkew(detectExtractorSkew(man("abcd1234"), man("ef567890")));
    expect(msg).toContain("abcd1234");
    expect(msg).toContain("ef567890");
  });

  it("labels a missing hash explicitly", () => {
    const msg = describeExtractorSkew(detectExtractorSkew(man(undefined), man("ef567890")));
    expect(msg).toContain("pre-extractorHash");
  });
});
