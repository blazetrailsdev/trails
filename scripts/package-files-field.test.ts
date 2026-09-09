import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every publishable package must declare `files`, and `dist` must be in it.
 *
 * Without `files`, npm falls back to the nearest `.gitignore` to decide what a
 * tarball holds — and this repository's root `.gitignore` ignores `dist/`. The
 * result is a tarball with the package's `src` and none of its build output
 * except the one file `main` names, which npm force-includes. The package then
 * installs, resolves its entry point, and fails on the first relative import
 * that entry point makes.
 *
 * It is invisible here, because nothing in this repository installs a packed
 * tarball — the workspace links `packages/*` directly, so `files` is never
 * consulted. It surfaces downstream: trailmap vendors these packages as packed
 * tarballs, and a re-vendor produced a `@blazetrails/date` holding
 * `dist/index.js`, no type declarations, and no `dist/date.js` for
 * `dist/index.js` to import.
 *
 * Five packages had drifted out of the convention the other sixteen keep. This
 * is the check that stops a sixth, since no build, test or lint here reads the
 * field.
 */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES = path.join(REPO_ROOT, "packages");

interface PackageManifest {
  name?: string;
  private?: boolean;
  files?: string[];
}

async function manifests(): Promise<[string, PackageManifest][]> {
  const found: [string, PackageManifest][] = [];
  for (const dir of (await readdir(PACKAGES, { withFileTypes: true })).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )) {
    if (!dir.isDirectory()) continue;
    const manifest = path.join(PACKAGES, dir.name, "package.json");
    const source = await readFile(manifest, "utf8").catch(() => null);
    if (source === null) continue;
    found.push([dir.name, JSON.parse(source) as PackageManifest]);
  }
  return found;
}

/** A private package is never packed, so its `files` decides nothing. */
const publishable = (entries: [string, PackageManifest][]): [string, PackageManifest][] =>
  entries.filter(([, manifest]) => manifest.private !== true);

describe("packages/*/package.json", () => {
  it("declares files on every publishable package", async () => {
    const missing = publishable(await manifests())
      .filter(([, manifest]) => !Array.isArray(manifest.files))
      .map(([dir]) => dir);
    expect(missing).toEqual([]);
  });

  it("includes dist in files on every publishable package", async () => {
    const withoutDist = publishable(await manifests())
      .filter(([, manifest]) => Array.isArray(manifest.files) && !manifest.files.includes("dist"))
      .map(([dir]) => dir);
    expect(withoutDist).toEqual([]);
  });
});
