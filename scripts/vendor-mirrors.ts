#!/usr/bin/env -S npx tsx
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as apiCompareConfigModule from "./api-compare/config.js";
import { SOURCES } from "../vendor/sources.js";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export interface Mirror {
  source: string;
  ref: string;
  sha: string;
}

interface Lockfile {
  sources: Record<string, { ref: string; sha: string }>;
}

function cjs<T extends object>(ns: T): T {
  return "default" in ns ? (ns.default as T) : ns;
}
const { PACKAGE_DIR_OVERRIDES } = cjs(apiCompareConfigModule);

function portedIn(name: string, portedBy: string | undefined): string {
  return portedBy ?? PACKAGE_DIR_OVERRIDES[name] ?? name;
}

/**
 * Expected `mirrors` field for every package directory, from
 * `vendor/sources.lock.json`; `null` where no source maps to the package
 * (RFC 0191 § 6). `pnpm vendor:mirrors` writes it and `--check` reports drift.
 *
 * `mirrors` lists the upstream sources a package is ported from, each with the
 * `ref` and commit `sha` the parity gates measure that package against. It says
 * nothing about how far the port has got: a package can name a `ref` while the
 * bump ledger for that source still has open rows.
 */
export async function expectedMirrors(root = REPO_ROOT): Promise<Map<string, Mirror[] | null>> {
  const lock = JSON.parse(
    await readFile(join(root, "vendor/sources.lock.json"), "utf8"),
  ) as Lockfile;
  const out = new Map<string, Mirror[] | null>();
  const dirs = (await readdir(join(root, "packages"), { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  for (const dir of dirs) {
    const sources = SOURCES.filter((s) =>
      s.packages.some((p) => portedIn(p.name, p.portedBy) === dir),
    )
      .map((s) => s.name)
      .sort();
    out.set(
      dir,
      sources.length === 0
        ? null
        : sources.map((source) => {
            const locked = lock.sources[source];
            if (locked === undefined)
              throw new Error(`sources.lock.json has no entry for ${source}`);
            return { source, ref: locked.ref, sha: locked.sha };
          }),
    );
  }
  return out;
}

async function packageJsonOf(root: string, dir: string): Promise<string | null> {
  try {
    return await readFile(join(root, "packages", dir, "package.json"), "utf8");
  } catch {
    return null;
  }
}

/** One line per package whose `mirrors` differs from the lockfile; empty when all agree. */
export async function check(root = REPO_ROOT): Promise<{ errors: string[]; noUpstream: string[] }> {
  const errors: string[] = [];
  const noUpstream: string[] = [];
  for (const [dir, expected] of await expectedMirrors(root)) {
    const text = await packageJsonOf(root, dir);
    if (text === null) {
      if (expected !== null)
        errors.push(`packages/${dir} mirrors a source but has no package.json`);
      continue;
    }
    const actual = (JSON.parse(text) as { mirrors?: unknown }).mirrors;
    if (expected === null) {
      noUpstream.push(dir);
      if (actual !== undefined)
        errors.push(`packages/${dir}/package.json has a mirrors field but no source maps to it`);
    } else if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      errors.push(
        `packages/${dir}/package.json mirrors ${JSON.stringify(actual)}, lockfile says ${JSON.stringify(expected)}`,
      );
    }
  }
  return { errors, noUpstream };
}

export async function write(root = REPO_ROOT): Promise<string[]> {
  const changed: string[] = [];
  for (const [dir, expected] of await expectedMirrors(root)) {
    const text = await packageJsonOf(root, dir);
    if (text === null) continue;
    const pkg = JSON.parse(text) as Record<string, unknown>;
    if (expected === null) delete pkg.mirrors;
    else pkg.mirrors = expected;
    const next = JSON.stringify(pkg, null, 2) + "\n";
    if (next !== text) {
      await writeFile(join(root, "packages", dir, "package.json"), next);
      changed.push(dir);
    }
  }
  return changed;
}

export async function main(argv: string[]): Promise<number> {
  if (argv.includes("--check")) {
    const { errors, noUpstream } = await check();
    console.log(`no upstream source, so no mirrors field: ${noUpstream.join(", ")}`);
    for (const e of errors) console.error(e);
    if (errors.length > 0) console.error("run `pnpm vendor:mirrors` to regenerate");
    return errors.length > 0 ? 1 : 0;
  }
  const changed = await write();
  console.log(changed.length ? `updated: ${changed.join(", ")}` : "all mirrors fields current");
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    },
  );
}
