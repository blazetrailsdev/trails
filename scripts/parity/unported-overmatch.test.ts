import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { testPathsManifest } from "../../vendor/sources.js";
import { UNPORTED_FILES } from "./unported-files.js";

// Recurrence guard for the bare-filename substring overmatch bug (PR #4891):
// a whole-file `testFile` keyed by a bare basename matches by plain substring
// in isTestFileUnported and can silently drop unrelated, already-ported Rails
// files from test:compare accounting. Walk the vendored Rails test tree and
// assert every whole-file entry resolves to at most one file. Directory-prefix
// entries (trailing "/") are a deliberate bulk exclusion and exempt.

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith("_test.rb")) out.push(p);
  }
  return out;
}

describe("UNPORTED_FILES whole-file testFile entries do not overmatch", () => {
  it("each resolves to at most one vendored Rails test file", async () => {
    const manifest = testPathsManifest();
    const relByPkg: Record<string, string[]> = {};
    let total = 0;
    for (const [pkg, root] of Object.entries(manifest)) {
      const rels = (await walk(root)).map((f) => relative(root, f));
      relByPkg[pkg] = rels;
      total += rels.length;
    }
    // Vendor not populated (bare checkout) — nothing to check.
    if (total === 0) return;

    const offenders: string[] = [];
    for (const e of UNPORTED_FILES) {
      if (!e.testFile || e.tests) continue;
      const p = e.testFile;
      if (p.endsWith("/")) continue; // deliberate directory-prefix exclusion
      const scope = "package" in e ? e.package : undefined;
      const matched = new Set<string>();
      for (const [pkg, rels] of Object.entries(relByPkg)) {
        if (scope !== undefined && scope !== pkg) continue;
        for (const r of rels) {
          const hit = p.startsWith("/") ? r === p.slice(1) || r.includes(p) : r.includes(p);
          if (hit) matched.add(`${pkg}:${r}`);
        }
      }
      if (matched.size > 1) {
        offenders.push(
          `"${p}"${scope ? ` (package: ${scope})` : ""} matches ${matched.size} files:\n    ` +
            [...matched].join("\n    ") +
            "\n  Anchor with a leading '/', path-qualify (cases/foo_test.rb), " +
            "or add a `package` scope so unrelated files stay counted.",
        );
      }
    }
    expect(offenders, offenders.join("\n\n")).toEqual([]);
  });
});
