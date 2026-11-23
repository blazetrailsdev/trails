import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The publish shape every public package shares (RFC 0100): one lockstep
 * version, exact internal pins, no runtime dependency on a private package,
 * and the registry metadata a release needs.
 */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES = path.join(REPO_ROOT, "packages");

interface Manifest {
  name: string;
  version: string;
  private?: boolean;
  license?: string;
  homepage?: string;
  repository?: { url?: string; directory?: string };
  publishConfig?: { access?: string };
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

const RUNTIME = ["dependencies", "peerDependencies", "optionalDependencies"] as const;

async function manifests(): Promise<[string, Manifest][]> {
  const found: [string, Manifest][] = [];
  for (const dir of (await readdir(PACKAGES)).sort()) {
    const source = await readFile(path.join(PACKAGES, dir, "package.json"), "utf8").catch(
      () => null,
    );
    if (source !== null) found.push([dir, JSON.parse(source) as Manifest]);
  }
  return found;
}

const published = async () => (await manifests()).filter(([, m]) => m.private !== true);

describe("published packages/*/package.json", () => {
  it("share one lockstep version", async () => {
    const versions = new Set((await published()).map(([, m]) => m.version));
    expect([...versions]).toHaveLength(1);
  });

  it("carry license, repository, homepage and public access", async () => {
    const bad = (await published())
      .filter(
        ([dir, m]) =>
          m.license !== "MIT" ||
          m.repository?.directory !== `packages/${dir}` ||
          !m.repository.url ||
          !m.homepage ||
          m.publishConfig?.access !== "public",
      )
      .map(([dir]) => dir);
    expect(bad).toEqual([]);
  });

  it("pin internal runtime dependencies with workspace:*", async () => {
    const bad: string[] = [];
    for (const [dir, m] of await published())
      for (const field of RUNTIME)
        for (const [name, range] of Object.entries(m[field] ?? {}))
          if (name.startsWith("@blazetrails/") && range !== "workspace:*")
            bad.push(`${dir} ${field} ${name}@${range}`);
    expect(bad).toEqual([]);
  });

  it("depend at runtime on no private package", async () => {
    const all = await manifests();
    const privates = new Set(all.filter(([, m]) => m.private === true).map(([, m]) => m.name));
    const bad: string[] = [];
    for (const [dir, m] of all.filter(([, m]) => m.private !== true))
      for (const field of RUNTIME)
        for (const name of Object.keys(m[field] ?? {}))
          if (privates.has(name)) bad.push(`${dir} ${field} ${name}`);
    expect(bad).toEqual([]);
  });
});
