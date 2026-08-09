import { describe, expect, it } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "node:url";

import type { ApiManifest } from "@blazetrails/parity/types";
import {
  CALL_ARG_DESCRIPTOR_VOCABULARY,
  RUBY_ONLY_CALL_ARG_DESCRIPTORS,
  describeExtractorSkew,
  detectExtractorSkew,
} from "./extractor-skew.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

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

describe("call-argument descriptor vocabulary", () => {
  it("is spelled identically by both extractors", async () => {
    const ruby = await fs.readFile(path.join(HERE, "extract-ruby-api.rb"), "utf-8");
    const tsSource = await fs.readFile(path.join(HERE, "extract-ts-api.ts"), "utf-8");
    const missing = CALL_ARG_DESCRIPTOR_VOCABULARY.filter(
      (token) => !ruby.includes(token) || !tsSource.includes(token),
    );
    expect(missing).toEqual([]);
  });

  // The TS side of this pair — that the TS extractor emits nothing outside the
  // vocabulary — is pinned in extract-ts-api.test.ts, where the extractor can be
  // run over a fixture covering every argument form.
  it("names the descriptors only the Ruby extractor produces", async () => {
    const ruby = await fs.readFile(path.join(HERE, "extract-ruby-api.rb"), "utf-8");
    for (const token of RUBY_ONLY_CALL_ARG_DESCRIPTORS) expect(ruby).toContain(token);
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
