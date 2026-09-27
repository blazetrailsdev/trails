import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { lockedVersions, REPO_ROOT, trackedFiles, unrecitedCitations } from "./vendor-recite.js";

// RFC 0159: every tracked `vendor/<source>/…` citation names its source's
// active version. Reads vendor/sources.lock.json only — the Unit Tests job has
// no fetched vendor/ tree. Sits beside eslint/ruby-compat-needs-mri-citation.mjs,
// which resolves MRI citations against the fetched tree and so runs only in
// rails-comparison.
describe("vendor citations", () => {
  it("every tracked citation names its source's active version", async () => {
    const versions = await lockedVersions(REPO_ROOT);
    const found = await unrecitedCitations(REPO_ROOT, await trackedFiles(REPO_ROOT), versions);
    expect(
      found,
      `${found.length} citation(s) are unversioned or stale; run \`pnpm vendor:recite\`:\n  ${found.join("\n  ")}`,
    ).toEqual([]);
  }, 120_000);

  it("flags an unversioned and a stale citation by file:line", async () => {
    const root = await mkdtemp(join(tmpdir(), "vendor-citations-"));
    const files: Record<string, string> = {
      "vendor/sources.lock.json": JSON.stringify({
        sources: { rails: { ref: "v8.0.2" }, ruby: { ref: "v3_3_11" } },
      }),
      "packages/a/src/unversioned.ts":
        "// ok\n// vendor/rails/activerecord/lib/active_record.rb:1\n",
      "docs/stale.md": "See `vendor/ruby/v3.3.0/re.c:4144`.\n",
      "packages/a/src/current.ts": "// vendor/rails/v8.0.2/activerecord/lib/active_record.rb:1\n",
    };
    try {
      for (const [path, text] of Object.entries(files)) {
        await mkdir(dirname(join(root, path)), { recursive: true });
        await writeFile(join(root, path), text);
      }
      const fixtureVersions = await lockedVersions(root);
      expect(fixtureVersions).toEqual({ rails: "v8.0.2", ruby: "v3.3.11" });
      const found = await unrecitedCitations(root, Object.keys(files), fixtureVersions);
      expect(found).toEqual(["packages/a/src/unversioned.ts:2", "docs/stale.md:1"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
