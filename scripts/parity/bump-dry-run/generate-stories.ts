#!/usr/bin/env -S npx tsx
/**
 * `pnpm parity:bump:stories --source <name> --from <ref> --to <ref>
 *   --from-tests <rails-tests.json> --rfc <rfc-id> --out <stories dir>
 *   [--to-tests <rails-tests.json>] [--config <json>]`
 * (RFC 0191 § 7, item 4): writes the burn-down stories for a bump from its
 * seeded ledger (`scripts/parity/bump-ledger/<source>.json`, `.tests.json`).
 * `--from-tests` is test-compare's `rails-tests.json` extracted at `--from`;
 * `--to-tests` defaults to the current one. `--config` holds `order`,
 * `subsystems`, `fileDeps`, `splitThreshold`, `trailsPackage` and `cluster` (`stories.ts`).
 *
 * Hard rules: no node:* imports; process.* only in the entry guard.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";

import type { PairSeedRow, RubyTestManifest, TestSeedRow } from "./ledger.js";
import { planStories, renderStory, type StoryInput } from "./stories.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { SOURCES, versionDir } = await import("../../../vendor/sources.js");

interface Config {
  order?: string[];
  subsystems?: StoryInput["subsystems"];
  fileDeps?: StoryInput["fileDeps"];
  splitThreshold?: number;
  trailsPackage?: StoryInput["trailsPackage"];
  cluster?: string;
}

function flag(args: readonly string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  const v = i >= 0 ? args[i + 1] : undefined;
  return v === undefined || v.startsWith("--") ? undefined : v;
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(path.resolve(ROOT, file), "utf8")) as T;
}

interface Comparison {
  results: {
    package: string;
    files: {
      rubyFile: string;
      expectedTsFile?: string;
      conventionTsFile?: string;
      tsFileExists?: boolean;
      missingTests?: string[];
    }[];
  }[];
}

function missingOf(c: Comparison) {
  const m = new Map<string, Set<string>>();
  for (const r of c.results)
    for (const f of r.files)
      if (f.tsFileExists) m.set(`${r.package} ${f.rubyFile}`, new Set(f.missingTests ?? []));
  return m;
}

function fileMap(c: Comparison, field: "expectedTsFile" | "conventionTsFile") {
  const m = new Map<string, string>();
  for (const r of c.results)
    for (const f of r.files) if (f[field]) m.set(`${r.package} ${f.rubyFile}`, f[field]);
  return m;
}

export async function main(args: readonly string[]): Promise<number> {
  const [sourceName, from, to, fromTests, rfc, out] = [
    "source",
    "from",
    "to",
    "from-tests",
    "rfc",
    "out",
  ].map((n) => flag(args, n));
  const source = SOURCES.find((s) => s.name === sourceName);
  if (!source || !from || !to || !fromTests || !rfc || !out) {
    console.error(
      "usage: generate-stories.ts --source <name> --from <ref> --to <ref> " +
        "--from-tests <file> --rfc <rfc-id> --out <dir> [--to-tests <file>] [--config <json>]",
    );
    return 2;
  }
  const configFile = flag(args, "config");
  const config = configFile ? await readJson<Config>(configFile) : {};
  const dir = (kind: "libPath" | "testPath") => (pkg: string, ref: string) => {
    const entry = source.packages.find((p) => p.name === pkg);
    return path.posix.join("vendor", source.name, versionDir(ref), entry?.[kind] ?? pkg);
  };
  const testComparison = await readJson<Comparison>(
    "scripts/test-compare/output/convention-comparison.json",
  );
  const input: StoryInput = {
    source: source.name,
    from,
    to,
    rfc,
    pairRows: await readJson<PairSeedRow[]>(`scripts/parity/bump-ledger/${source.name}.json`),
    testRows: await readJson<TestSeedRow[]>(
      `scripts/parity/bump-ledger/${source.name}.tests.json`,
    ).catch((e: NodeJS.ErrnoException) => {
      if (e.code === "ENOENT") return [];
      throw e;
    }),
    fromTests: await readJson<RubyTestManifest>(fromTests),
    toTests: await readJson<RubyTestManifest>(
      flag(args, "to-tests") ?? "scripts/test-compare/output/rails-tests.json",
    ),
    tsFileOf: fileMap(
      await readJson<Comparison>("scripts/api-compare/output/api-comparison.json"),
      "expectedTsFile",
    ),
    tsTestFileOf: fileMap(testComparison, "conventionTsFile"),
    missing: missingOf(testComparison),
    libDir: dir("libPath"),
    testDir: dir("testPath"),
    order: config.order ?? [],
    subsystems: config.subsystems ?? {},
    fileDeps: config.fileDeps ?? {},
    splitThreshold: config.splitThreshold ?? Infinity,
    trailsPackage: config.trailsPackage ?? {},
  };
  const stories = planStories(input);
  await fs.mkdir(path.resolve(ROOT, out), { recursive: true });
  for (const s of stories)
    await fs.writeFile(
      path.resolve(ROOT, out, `${s.id}.md`),
      renderStory(input, s, config.cluster ?? "burn-down"),
    );
  console.log(`[bump] wrote ${stories.length} stories to ${out}`);
  return 0;
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url))
  process.exitCode = await main(process.argv.slice(2));
