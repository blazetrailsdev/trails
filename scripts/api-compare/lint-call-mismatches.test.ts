import { describe, it, expect } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import {
  callOf,
  compareKeys,
  diffAgainstBaseline,
  findDuplicateKeys,
  flattenArtifact,
  keyOf,
  loadBaseline,
  missingScope,
  reseed,
  findNonCanonicalBaselines,
  serializeBaseline,
  type ExcludeEntry,
} from "./lint-call-mismatches.js";

describe("callOf", () => {
  it("extracts the Ruby call name before the arrow", () => {
    expect(callOf("save → save")).toBe("save");
    expect(callOf("save! → saveBang")).toBe("save!");
    expect(callOf("clear_attribute_changes → clearAttributeChanges")).toBe(
      "clear_attribute_changes",
    );
  });
});

describe("flattenArtifact", () => {
  it("emits one key per missing call, splitting multi-call records", () => {
    const keys = flattenArtifact({
      mismatches: [
        {
          package: "ar",
          tsFile: "a.ts",
          rubyName: "foo",
          missing: ["save → save", "destroy → destroy"],
        },
        { package: "ar", tsFile: "b.ts", rubyName: "bar", missing: ["touch → touch"] },
      ],
    });
    expect(keys.map(keyOf)).toEqual([
      "ar a.ts foo save",
      "ar a.ts foo destroy",
      "ar b.ts bar touch",
    ]);
  });

  it("keeps same tsFile+rubyName+call distinct across packages (package is in the key)", () => {
    const keys = flattenArtifact({
      mismatches: [
        { package: "ar", tsFile: "a.ts", rubyName: "foo", missing: ["save → save"] },
        { package: "am", tsFile: "a.ts", rubyName: "foo", missing: ["save → save"] },
      ],
    });
    expect(new Set(keys.map(keyOf)).size).toBe(2);
  });
});

const baseline: ExcludeEntry[] = [
  { package: "ar", tsFile: "a.ts", rubyName: "foo", call: "save", reason: "known" },
  { package: "ar", tsFile: "b.ts", rubyName: "bar", call: "touch", reason: "known" },
];

describe("diffAgainstBaseline", () => {
  it("passes when current exactly equals the baseline", () => {
    const current = [
      { package: "ar", tsFile: "a.ts", rubyName: "foo", call: "save" },
      { package: "ar", tsFile: "b.ts", rubyName: "bar", call: "touch" },
    ];
    const { added, stale } = diffAgainstBaseline(current, baseline);
    expect(added).toEqual([]);
    expect(stale).toEqual([]);
  });

  it("reports a NEW mismatch absent from the baseline (the ratchet)", () => {
    const current = [
      { package: "ar", tsFile: "a.ts", rubyName: "foo", call: "save" },
      { package: "ar", tsFile: "b.ts", rubyName: "bar", call: "touch" },
      { package: "ar", tsFile: "c.ts", rubyName: "baz", call: "update" },
    ];
    const { added, stale } = diffAgainstBaseline(current, baseline);
    expect(added.map(keyOf)).toEqual(["ar c.ts baz update"]);
    expect(stale).toEqual([]);
  });

  it("reports a STALE baseline entry that no longer flags (only-shrink)", () => {
    const current = [{ package: "ar", tsFile: "a.ts", rubyName: "foo", call: "save" }];
    const { added, stale } = diffAgainstBaseline(current, baseline);
    expect(added).toEqual([]);
    expect(stale.map(keyOf)).toEqual(["ar b.ts bar touch"]);
  });
});

describe("findDuplicateKeys", () => {
  it("returns nothing for a clean baseline", () => {
    expect(findDuplicateKeys(baseline)).toEqual([]);
  });

  it("flags a (package, tsFile, rubyName, call) repeated across rows", () => {
    expect(
      findDuplicateKeys([
        ...baseline,
        { package: "ar", tsFile: "a.ts", rubyName: "foo", call: "save", reason: "dup" },
      ]),
    ).toEqual(["ar a.ts foo save"]);
  });
});

describe("committed baseline", () => {
  it("is well-formed: no duplicate keys, every entry has a package and reason", async () => {
    const committed = await loadBaseline();
    expect(findDuplicateKeys(committed)).toEqual([]);
    for (const e of committed) {
      expect(e.package.trim().length).toBeGreaterThan(0);
      expect(e.reason.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("reseed", () => {
  it("preserves reasons for surviving entries and drops stale ones", () => {
    const current = [
      { package: "ar", tsFile: "a.ts", rubyName: "foo", call: "save" },
      { package: "ar", tsFile: "c.ts", rubyName: "baz", call: "update" },
    ];
    const next = reseed(current, baseline);
    expect(next).toEqual([
      { package: "ar", tsFile: "a.ts", rubyName: "foo", call: "save", reason: "known" },
      {
        package: "ar",
        tsFile: "c.ts",
        rubyName: "baz",
        call: "update",
        reason: expect.stringContaining("Baseline (RFC 0044)"),
      },
    ]);
  });

  it("honors a custom default reason for new entries (wide RFC 0047 seed)", () => {
    const current = [{ package: "ar", tsFile: "c.ts", rubyName: "baz", call: "update" }];
    const next = reseed(current, [], "wide seed");
    expect(next).toEqual([
      { package: "ar", tsFile: "c.ts", rubyName: "baz", call: "update", reason: "wide seed" },
    ]);
  });

  it("collapses artifact rows that share a key into one baseline entry", () => {
    // The wide population emits the same Ruby call mapped to two TS candidates
    // as two `missing` rows → duplicate keys; reseed must produce a 1:1 baseline.
    const current = flattenArtifact({
      mismatches: [
        {
          package: "ar",
          tsFile: "a.ts",
          rubyName: "foo",
          missing: ["save → saveA", "save → saveB"],
        },
      ],
    });
    const next = reseed(current, [], "wide seed");
    expect(next).toEqual([
      { package: "ar", tsFile: "a.ts", rubyName: "foo", call: "save", reason: "wide seed" },
    ]);
    expect(findDuplicateKeys(next)).toEqual([]);
  });
});

describe("missingScope", () => {
  const expected = ["activerecord", "activesupport", "rack"];

  it("returns nothing when the artifact covers every expected package", () => {
    expect(
      missingScope(
        { packages: ["rack", "activerecord", "activesupport"], mismatches: [] },
        expected,
      ),
    ).toEqual([]);
  });

  it("flags packages the artifact never compared (partial-scope/stale-cache run)", () => {
    expect(missingScope({ packages: ["activerecord"], mismatches: [] }, expected)).toEqual([
      "activesupport",
      "rack",
    ]);
  });

  it("treats a missing `packages` field (pre-field artifact) as full partial-scope", () => {
    expect(missingScope({ mismatches: [] }, expected)).toEqual([
      "activerecord",
      "activesupport",
      "rack",
    ]);
  });

  it("ignores extra packages the artifact compared beyond the expected set", () => {
    expect(missingScope({ packages: [...expected, "arel"], mismatches: [] }, expected)).toEqual([]);
  });
});

describe("compareKeys", () => {
  const k = (rubyName: string, call = "c") => ({
    package: "actioncontroller",
    tsFile: "metal/strong-parameters.ts",
    rubyName,
    call,
  });

  // ICU collation demotes punctuation to a secondary difference and would put
  // `permit_any_in_array` first; code units put "!" (0x21) before "_" (0x5f).
  it("orders punctuation by code unit, not locale collation", () => {
    expect(compareKeys(k("permit!"), k("permit_any_in_array"))).toBeLessThan(0);
    expect(compareKeys(k("permit_any_in_array"), k("permit!"))).toBeGreaterThan(0);
  });

  it("is zero only for identical keys", () => {
    expect(compareKeys(k("permit!"), k("permit!"))).toBe(0);
    expect(compareKeys(k("permit!"), k("permit?"))).not.toBe(0);
    expect(compareKeys(k("permit!", "a"), k("permit!", "b"))).not.toBe(0);
  });
});

describe("serializeBaseline", () => {
  const entry = { reason: "Converged (RFC 0032) \u2014 no include? call exists to match." };

  it("writes non-ASCII literally rather than as \\uXXXX escapes", () => {
    const out = serializeBaseline([entry]);
    expect(out).toContain("\u2014");
    expect(out).not.toContain("\\u2014");
  });

  it("round-trips its own output byte-for-byte", () => {
    const once = serializeBaseline([entry]);
    expect(serializeBaseline(JSON.parse(once))).toBe(once);
  });

  it("indents with two spaces and ends in a newline", () => {
    expect(serializeBaseline([entry])).toMatch(/^\[\n {2}\{\n {4}"reason"/);
    expect(serializeBaseline([entry]).endsWith("\n")).toBe(true);
  });
});

describe("findNonCanonicalBaselines", () => {
  const entry = { reason: "an em-dash \u2014 in prose" };

  async function withFiles<T>(
    files: Record<string, string>,
    fn: (dir: string, paths: string[]) => Promise<T>,
  ): Promise<T> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "canon-baseline-"));
    const paths: string[] = [];
    for (const [name, text] of Object.entries(files)) {
      const p = path.join(dir, name);
      await fs.writeFile(p, text);
      paths.push(p);
    }
    try {
      return await fn(dir, paths);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }

  it("passes a file already written in canonical form", async () => {
    await withFiles({ "a.json": serializeBaseline([entry]) }, async (_dir, paths) => {
      expect(await findNonCanonicalBaselines(paths)).toEqual([]);
    });
  });

  it("flags a file whose non-ASCII is escaped (the churn trap)", async () => {
    // Semantically identical to the canonical form — only the bytes differ, so
    // every `--write` would silently rewrite it.
    const escaped = JSON.stringify([entry], null, 2).replace("\u2014", "\\u2014") + "\n";
    await withFiles({ "a.json": escaped }, async (_dir, paths) => {
      expect(JSON.parse(escaped)).toEqual([entry]);
      expect(await findNonCanonicalBaselines(paths)).toEqual(paths);
    });
  });

  it("flags a file missing its trailing newline", async () => {
    const raw = JSON.stringify([entry], null, 2);
    await withFiles({ "a.json": raw }, async (_dir, paths) => {
      expect(await findNonCanonicalBaselines(paths)).toEqual(paths);
    });
  });
});
