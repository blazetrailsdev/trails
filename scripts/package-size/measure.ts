/**
 * Package-size and bundle-size budget gate (RFC 0100,
 * `package-size-budget-ci-gate`).
 *
 * For each audited package it measures `npm pack --dry-run --json`'s tarball
 * `size`, `unpackedSize` and `entryCount`; for activerecord it also bundles
 * `import { Base } from "@blazetrails/activerecord"` with esbuild
 * (`--bundle --minify`, no `external`, so a driver that becomes statically
 * reachable again fails the build with `Could not resolve "pg"`) and records the
 * minified and gzipped bytes.
 *
 * Each number is compared against `baseline.json`. The gate is only-shrink
 * within `TOLERANCE`: a number above `baseline * (1 + TOLERANCE)` fails. Growth
 * is a reviewed hand edit of that one row, with a one-line `reason`; there is no
 * reseed. `--tighten` lowers every row to a measured number below it and never
 * raises one. Needs `pnpm build` first; it reuses `dist`.
 */
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { AUDITED_PACKAGES, REPO_ROOT } from "./side-effects.js";

const BASELINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "baseline.json");
export const TOLERANCE = 0.01;

export type Metrics = Record<string, number>;
interface Row {
  value: number;
  reason?: string;
}
type Baseline = Record<string, Record<string, Row>>;

async function packMetrics(pkg: string): Promise<Metrics> {
  const { stdout } = await promisify(execFile)("npm", ["pack", "--dry-run", "--json"], {
    cwd: path.join(REPO_ROOT, "packages", pkg),
    maxBuffer: 256 * 1024 * 1024,
  });
  const [info] = JSON.parse(stdout) as {
    size: number;
    unpackedSize: number;
    entryCount: number;
  }[];
  return { tarball: info.size, unpacked: info.unpackedSize, entries: info.entryCount };
}

export async function bundleBase(minify = true): Promise<{ code: Uint8Array; metafile: object }> {
  const result = await build({
    stdin: {
      contents: 'import { Base } from "@blazetrails/activerecord";\nconsole.log(Base);\n',
      resolveDir: path.join(REPO_ROOT, "packages", "activerecord"),
      loader: "js",
    },
    bundle: true,
    minify,
    platform: "node",
    format: "esm",
    write: false,
    metafile: true,
    logLevel: "silent",
  });
  return { code: result.outputFiles[0].contents, metafile: result.metafile };
}

async function measureAll(): Promise<Record<string, Metrics>> {
  const measured: Record<string, Metrics> = {};
  for (const pkg of AUDITED_PACKAGES) measured[pkg] = await packMetrics(pkg);
  const { code } = await bundleBase();
  measured["bundle:Base"] = { minified: code.byteLength, gzip: gzipSync(code).byteLength };
  return measured;
}

export function compare(baseline: Baseline, measured: Record<string, Metrics>): string[] {
  const failures: string[] = [];
  for (const [unit, metrics] of Object.entries(measured)) {
    for (const [metric, value] of Object.entries(metrics)) {
      const row = baseline[unit]?.[metric];
      if (!row) {
        failures.push(`${unit} ${metric}: no baseline row (measured ${value})`);
      } else if (value > Math.ceil(row.value * (1 + TOLERANCE))) {
        failures.push(`${unit} ${metric}: ${value} > baseline ${row.value} (+${TOLERANCE * 100}%)`);
      }
    }
  }
  return failures;
}

async function main(): Promise<void> {
  const started = Date.now();
  const baseline = JSON.parse(await readFile(BASELINE, "utf8")) as Baseline;
  const measured = await measureAll();
  for (const [unit, metrics] of Object.entries(measured)) {
    console.log(`${unit}: ${JSON.stringify(metrics)}`);
  }
  if (process.argv.includes("--tighten")) {
    for (const [unit, metrics] of Object.entries(measured)) {
      for (const [metric, value] of Object.entries(metrics)) {
        const row = baseline[unit]?.[metric];
        if (row && value < row.value) baseline[unit][metric] = { value };
      }
    }
    await writeFile(BASELINE, `${JSON.stringify(baseline, null, 2)}\n`);
  }
  const failures = compare(baseline, measured);
  console.log(`measured in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (failures.length > 0) {
    console.error(failures.join("\n"));
    console.error(
      "Shrink the package, or hand-edit that row of scripts/package-size/baseline.json with a one-line reason.",
    );
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
