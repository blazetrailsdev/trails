/**
 * File-independent companion to the `rails-error-parity` ESLint rule.
 *
 * That rule is file-driven: it only fires when ESLint visits an in-scope source
 * file. A manifest error class whose Rails home file is *entirely unported*
 * (the mapped `.ts` does not exist) therefore passes silently — no
 * `missingClass` is ever emitted because there is no file to lint. This test
 * closes that blind spot by walking the manifest directly:
 *
 *   - every manifest error class whose mapped home file is absent (and whose
 *     home file isn't already grandfathered in `rails-error-parity-exclude.json`)
 *     must be listed in `rails-error-parity-unported.json` with a reason; and
 *   - the allowlist is a ratchet — every entry must still be genuinely unported,
 *     so once a subsystem lands the entry has to be removed (the list only
 *     shrinks).
 *
 * Mapping mirrors the rule's `PKG_NS` + `rubyToSrcRel` (snake_case→kebab-case)
 * and its exclude semantics exactly. No node:* imports; async fs only.
 */
import { readFile, stat } from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { describe, it, expect } from "vitest";
// Reuse the rule's own namespace map + path mapping so this file-independent
// check can never drift from the file-driven rule it backstops.
import { PKG_NS, rubyToSrcRel } from "./rails-error-parity.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function entryKey(e) {
  return `${e.package}::${e.rubyFile}::${e.name}`;
}

async function fileExists(absPath) {
  try {
    await stat(absPath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(absPath) {
  return JSON.parse(await readFile(absPath, "utf8"));
}

/**
 * Walk the manifest and return the manifest error classes whose mapped home
 * file is absent and not grandfathered in the exclude baseline. `exists` is
 * injectable so the comparison logic can be unit-tested without the real tree.
 */
async function findUnported(manifest, excludeSet, exists) {
  const out = [];
  for (const [pkg, classes] of Object.entries(manifest.packages ?? {})) {
    const ns = PKG_NS[pkg];
    if (!ns) continue;
    for (const e of classes) {
      if (!e.rubyFile.startsWith(ns)) continue;
      const rel = `packages/${pkg}/src/${rubyToSrcRel(e.rubyFile)}`;
      if (excludeSet.has(rel)) continue;
      if (await exists(rel)) continue;
      out.push({ package: pkg, name: e.name, rubyFile: e.rubyFile });
    }
  }
  return out;
}

const manifestPath =
  process.env.RAILS_ERROR_CLASSES_PATH ?? path.join(__dirname, "rails-error-classes.json");
const excludePath =
  process.env.RAILS_ERROR_PARITY_EXCLUDE_PATH ??
  path.join(__dirname, "rails-error-parity-exclude.json");
const allowlistPath =
  process.env.RAILS_ERROR_PARITY_UNPORTED_PATH ??
  path.join(__dirname, "rails-error-parity-unported.json");

describe("rails-error-parity unported allowlist", () => {
  it("every manifest error class with an absent home file is in the allowlist", async () => {
    const manifest = await readJson(manifestPath);
    const excludeSet = new Set(await readJson(excludePath));
    const allowlist = await readJson(allowlistPath);
    const allowKeys = new Set(allowlist.map(entryKey));

    const unported = await findUnported(manifest, excludeSet, (rel) =>
      fileExists(path.join(ROOT, rel)),
    );

    const unflagged = unported.filter((e) => !allowKeys.has(entryKey(e)));
    expect(
      unflagged,
      "Manifest error classes whose Rails home file is unported but absent from " +
        "eslint/rails-error-parity-unported.json. Add each to the allowlist with a " +
        "reason, or port the home file.",
    ).toEqual([]);
  });

  it("every allowlist entry is still genuinely unported (ratchet only shrinks)", async () => {
    const excludeSet = new Set(await readJson(excludePath));
    const allowlist = await readJson(allowlistPath);

    const stale = [];
    for (const e of allowlist) {
      const ns = PKG_NS[e.package];
      // Guard on the namespace the same way findUnported does, so an entry
      // whose rubyFile doesn't live under its package namespace is treated as
      // malformed (caught below) rather than silently path-mapped.
      const inNs = ns && e.rubyFile.startsWith(ns);
      const rel = `packages/${e.package}/src/${rubyToSrcRel(e.rubyFile)}`;
      const ported = inNs && !excludeSet.has(rel) && (await fileExists(path.join(ROOT, rel)));
      if (ported) stale.push(entryKey(e));
    }
    expect(
      stale,
      "Allowlist entries whose home file now exists — the subsystem is ported, so " +
        "remove them from eslint/rails-error-parity-unported.json (the ratchet only shrinks).",
    ).toEqual([]);
  });

  it("every allowlist entry has a non-empty reason and well-formed shape", async () => {
    const allowlist = await readJson(allowlistPath);
    for (const e of allowlist) {
      expect(typeof e.package, `entry ${JSON.stringify(e)} package`).toBe("string");
      expect(PKG_NS[e.package], `entry package ${e.package} is in-scope`).toBeTruthy();
      expect(typeof e.name, `entry ${JSON.stringify(e)} name`).toBe("string");
      expect(e.rubyFile?.endsWith(".rb"), `entry ${JSON.stringify(e)} rubyFile`).toBe(true);
      expect((e.reason ?? "").trim().length, `entry ${JSON.stringify(e)} reason`).toBeGreaterThan(
        0,
      );
    }
  });

  it("every allowlist entry corresponds to a real manifest error class", async () => {
    const manifest = await readJson(manifestPath);
    const manifestKeys = new Set();
    for (const [pkg, classes] of Object.entries(manifest.packages ?? {})) {
      for (const e of classes) manifestKeys.add(entryKey({ package: pkg, ...e }));
    }
    const allowlist = await readJson(allowlistPath);

    // Without this, a typo'd name/rubyFile (or an entry under the wrong package)
    // would persist forever: its file stays absent, so the ratchet in the
    // "still genuinely unported" test never forces its removal.
    const orphans = allowlist.map(entryKey).filter((k) => !manifestKeys.has(k));
    expect(
      orphans,
      "Allowlist entries that match no manifest error class (package/name/rubyFile). " +
        "Fix the typo or remove the entry from eslint/rails-error-parity-unported.json.",
    ).toEqual([]);
  });

  it("findUnported honors the exclude baseline and the path mapping", async () => {
    const manifest = {
      packages: {
        activesupport: [
          { name: "Missing", parent: "StandardError", rubyFile: "active_support/foo_bar.rb" },
          { name: "Present", parent: "StandardError", rubyFile: "active_support/baz.rb" },
          { name: "Excluded", parent: "StandardError", rubyFile: "active_support/qux.rb" },
        ],
        unknownpkg: [
          { name: "OutOfScope", parent: "StandardError", rubyFile: "active_support/foo_bar.rb" },
        ],
      },
    };
    // baz.ts "exists"; foo_bar.rb maps to foo-bar.ts (snake→kebab) and is absent.
    const exists = async (rel) => rel === "packages/activesupport/src/baz.ts";
    const excludeSet = new Set(["packages/activesupport/src/qux.ts"]);

    const result = await findUnported(manifest, excludeSet, exists);
    expect(result).toEqual([
      { package: "activesupport", name: "Missing", rubyFile: "active_support/foo_bar.rb" },
    ]);
  });
});
