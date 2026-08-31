import { describe, expect, it } from "vitest";
import { type Artifact, type ExcludeEntry } from "./call-mismatch-baseline.js";
import { reverseRows } from "./report-ruby-compat.js";
import { diffAgainstBaseline, keyOf } from "./call-mismatch-baseline.js";
import { ENROLLED_PACKAGES, renderKey } from "./lint-ruby-compat-calls.js";

const row = (pkg: string, tsFile: string, rubyName: string, missing: string) => ({
  package: pkg,
  tsFile,
  rubyName,
  missing: [missing],
});

const artifact: Artifact = {
  packages: [],
  mismatches: [
    row("activesupport", "inflector/inflections.ts", "to_regex", "escape → escape|_escape"),
    row("i18n", "backend/base.ts", "translate", "each_key → each_key|_each_key"),
    row("actiondispatch", "routing/inspector.ts", "normalize_filter", "escape → escape|_escape"),
  ],
};

const baselined = (k: ReturnType<typeof reverseRows>[number]): ExcludeEntry => ({
  package: k.package,
  tsFile: k.tsFile,
  rubyName: k.rubyName,
  call: k.call,
  kind: "rubyCompat",
  reason: "reviewed",
});

describe("ruby-compat call ratchet", () => {
  it("enrolls i18n and activesupport, and nothing else", () => {
    expect([...ENROLLED_PACKAGES].sort()).toEqual(["activesupport", "i18n"]);
  });

  it("flags an unbaselined row in an enrolled package", () => {
    const current = reverseRows(artifact).filter((r) => ENROLLED_PACKAGES.includes(r.package));
    const { added, stale } = diffAgainstBaseline(current, []);
    expect(added.map(renderKey)).toEqual([
      "activesupport  inflector/inflections.ts  to_regex  escape → regexpEscape",
      "i18n  backend/base.ts  translate  each_key → eachKey",
    ]);
    expect(stale).toEqual([]);
  });

  it("leaves an unenrolled package's rows to the report", () => {
    const current = reverseRows(artifact).filter((r) => ENROLLED_PACKAGES.includes(r.package));
    expect(current.some((r) => r.package === "actiondispatch")).toBe(false);
  });

  it("passes a row a reviewed baseline entry covers", () => {
    const current = reverseRows(artifact).filter((r) => ENROLLED_PACKAGES.includes(r.package));
    const { added, stale } = diffAgainstBaseline(current, current.map(baselined));
    expect(added).toEqual([]);
    expect(stale).toEqual([]);
  });

  it("reports a converged baseline row as STALE — the only-shrink arm", () => {
    const converged = baselined(reverseRows(artifact)[0]);
    const { added, stale } = diffAgainstBaseline([], [converged]);
    expect(added).toEqual([]);
    expect(stale.map(keyOf)).toEqual(["activesupport inflector/inflections.ts to_regex escape"]);
  });
});
