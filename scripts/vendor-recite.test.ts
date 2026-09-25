import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { activeVersion, SOURCES } from "../vendor/sources.js";
import { EXCLUDED, isExcluded, recite, reciteText } from "./vendor-recite.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const rails = activeVersion(SOURCES.find((s) => s.name === "rails")!);
const ruby = activeVersion(SOURCES.find((s) => s.name === "ruby")!);

const FIXTURES: Record<string, { input: string; recited: string }> = {
  "packages/ruby-compat/src/unversioned.ts": {
    input:
      "/** Mirrors `vendor/ruby/rational.c:580` and vendor/rack-session/lib/rack/session/pool.rb */\n",
    recited: `/** Mirrors \`vendor/ruby/${ruby}/rational.c:580\` and vendor/rack-session/${activeVersion(SOURCES.find((s) => s.name === "rack-session")!)}/lib/rack/session/pool.rb */\n`,
  },
  "packages/activerecord/src/versioned.ts": {
    input: `// vendor/rails/${rails}/activerecord/lib/active_record/base.rb:12\n`,
    recited: `// vendor/rails/${rails}/activerecord/lib/active_record/base.rb:12\n`,
  },
  "docs/stale.md": {
    input:
      "See `vendor/rails/v7.1.0/activerecord/lib/active_record.rb` and `vendor/ruby/v3_3_11/re.c:4144`.\n",
    recited: `See \`vendor/rails/${rails}/activerecord/lib/active_record.rb\` and \`vendor/ruby/${ruby}/re.c:4144\`.\n`,
  },
};

const REGEX_BEARING = "eslint/ruby-compat-needs-mri-citation.mjs";
const REGEX_SOURCE =
  "const CITATION = /vendor\\/ruby\\/([A-Za-z0-9_./+-]+):(\\d+)/g;\n// vendor/ruby/rational.c:1\n";

async function fixtureTree(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vendor-recite-"));
  const files = { ...Object.fromEntries(Object.entries(FIXTURES).map(([p, f]) => [p, f.input])) };
  files[REGEX_BEARING] = REGEX_SOURCE;
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  return root;
}

const PATHS = [...Object.keys(FIXTURES), REGEX_BEARING];

describe("vendor:recite", () => {
  it("rewrites unversioned and stale citations and leaves versioned ones alone", async () => {
    const root = await fixtureTree();
    try {
      const changed = await recite(root, PATHS);
      expect(changed.sort()).toEqual(["docs/stale.md", "packages/ruby-compat/src/unversioned.ts"]);
      for (const [path, { recited }] of Object.entries(FIXTURES)) {
        expect(await readFile(join(root, path), "utf8")).toBe(recited);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("is idempotent: a second run changes nothing", async () => {
    const root = await fixtureTree();
    try {
      await recite(root, PATHS);
      expect(await recite(root, PATHS)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("--check reports without writing", async () => {
    const root = await fixtureTree();
    try {
      expect((await recite(root, PATHS, { check: true })).length).toBe(2);
      for (const [path, { input }] of Object.entries(FIXTURES)) {
        expect(await readFile(join(root, path), "utf8")).toBe(input);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("leaves a regex-bearing file on the exclusion list alone", async () => {
    const root = await fixtureTree();
    try {
      expect(reciteText(REGEX_SOURCE)).not.toBe(REGEX_SOURCE);
      await recite(root, PATHS);
      expect(await readFile(join(root, REGEX_BEARING), "utf8")).toBe(REGEX_SOURCE);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("excludes every file that matches or builds a citation", () => {
    for (const path of [
      "eslint/ruby-compat-needs-mri-citation.mjs",
      "eslint/ruby-compat-needs-mri-citation.test.mjs",
      "scripts/api-compare/jsdoc-tag-line.test.ts",
      "scripts/parity/legacy-script-names.ts",
      "vendor/sources.ts",
      "vendor/sources.test.ts",
      "vendor/README.md",
      "vendor/sources.lock.json",
    ]) {
      expect(isExcluded(path), path).toBe(true);
    }
    for (const reason of Object.values(EXCLUDED)) expect(reason.trim()).not.toBe("");
  });

  it("names only sources vendor/sources.ts declares", () => {
    const text = "vendor/bundle/ruby/3.3.0 and vendor/rails/ and vendor/rack-test/lib/rack/test.rb";
    const rackTest = activeVersion(SOURCES.find((s) => s.name === "rack-test")!);
    expect(reciteText(text)).toBe(
      `vendor/bundle/ruby/3.3.0 and vendor/rails/ and vendor/rack-test/${rackTest}/lib/rack/test.rb`,
    );
  });

  it("every excluded file exists in the checkout", async () => {
    for (const path of Object.keys(EXCLUDED)) {
      const text = await readFile(
        join(REPO_ROOT, path.endsWith("/") ? `${path}sources.ts` : path),
        "utf8",
      );
      expect(text.length, path).toBeGreaterThan(0);
    }
  });
});
