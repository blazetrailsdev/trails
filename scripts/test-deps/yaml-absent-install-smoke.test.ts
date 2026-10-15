// RFC 0170 Verification: a YAML-free trails app boots with the optional `yaml`
// package unresolvable. `yaml-optional-dependency.test.ts` proves no eager edge
// statically; this runs the BUILT dist under plain node (the Unit Tests job
// builds before vitest, and none of it reads vendor/rails). Rails has no
// counterpart: Psych is stdlib (`activerecord/lib/active_record.rb:31`).
import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const DIR = join(import.meta.dirname, "yaml-absent");

function runSmoke(withHook: boolean): Record<string, unknown> {
  const args = withHook ? ["--import", join(DIR, "hook.mjs")] : [];
  const res = spawnSync(process.execPath, [...args, join(DIR, "smoke.mjs")], {
    cwd: ROOT,
    encoding: "utf8",
    input: "",
  });
  expect(res.status, res.stderr).toBe(0);
  return JSON.parse(res.stdout.trim().split("\n").at(-1)!) as Record<string, unknown>;
}

async function publishedRoots(): Promise<string[]> {
  const names: string[] = [];
  for (const dir of await readdir(join(ROOT, "packages"))) {
    let pkg: { name: string; private?: boolean; main?: string; exports?: object };
    try {
      pkg = JSON.parse(await readFile(join(ROOT, "packages", dir, "package.json"), "utf8"));
    } catch {
      continue;
    }
    if (pkg.main || (pkg.exports && "." in pkg.exports)) names.push(pkg.name);
  }
  return names.sort();
}

describe("YAML-free install", () => {
  it("boots every package, ActiveRecord, a .ts fixture and a .json locale with yaml unresolvable", async () => {
    const result = runSmoke(true);

    expect(result.roots).toEqual(await publishedRoots());
    expect(result.payload).toEqual({ a: [1, 2] });
    expect(result.fixtureTitle).toBe("from fixture");
    expect(result.greeting).toBe("hello");
    expect(result.yamlLoad).toEqual({
      error: "LoadError",
      message: "cannot load such file -- yaml",
    });
  });

  it("loads YAML when yaml resolves, so the hook is what made it fail", () => {
    expect(runSmoke(false).yamlLoad).toEqual({ value: { a: 1 } });
  });
});
