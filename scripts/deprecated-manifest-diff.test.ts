import { describe, expect, it } from "vitest";
import { diffDeprecatedManifest } from "./deprecated-manifest-diff.js";
import type { DeprecatedManifest } from "./deprecated-manifest-diff.js";

const expected: DeprecatedManifest = {
  files: {
    "packages/activerecord/src/connection-adapters/mysql/schema-definitions.ts": [
      "unsignedDecimal",
      "unsignedFloat",
    ],
    "packages/activesupport/src/core-ext/benchmark.ts": ["ms"],
  },
};

describe("diffDeprecatedManifest", () => {
  it("reports no drift for an identical manifest", () => {
    expect(diffDeprecatedManifest(expected, structuredClone(expected))).toEqual({
      lost: [],
      extra: [],
      drifted: false,
    });
  });

  it("reports a file dropped by a partial regeneration as lost", () => {
    const actual = structuredClone(expected);
    delete actual.files["packages/activesupport/src/core-ext/benchmark.ts"];
    expect(diffDeprecatedManifest(expected, actual)).toEqual({
      lost: ["packages/activesupport/src/core-ext/benchmark.ts: ms"],
      extra: [],
      drifted: true,
    });
  });

  it("reports a single dropped name as lost", () => {
    const actual = structuredClone(expected);
    const file = "packages/activerecord/src/connection-adapters/mysql/schema-definitions.ts";
    actual.files[file] = ["unsignedDecimal"];
    expect(diffDeprecatedManifest(expected, actual).lost).toEqual([`${file}: unsignedFloat`]);
  });

  it("reports an entry the recompute no longer produces as stale", () => {
    const actual = structuredClone(expected);
    actual.files["packages/activesupport/src/core-ext/benchmark.ts"] = ["ms", "realtime"];
    expect(diffDeprecatedManifest(expected, actual)).toEqual({
      lost: [],
      extra: ["packages/activesupport/src/core-ext/benchmark.ts: realtime"],
      drifted: true,
    });
  });

  it("treats an empty manifest as having lost every entry", () => {
    expect(diffDeprecatedManifest(expected, { files: {} }).lost).toHaveLength(3);
  });
});
