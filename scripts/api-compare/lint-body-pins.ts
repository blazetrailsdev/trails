#!/usr/bin/env npx tsx
/**
 * CI gate for source-hash pinning (RFC 0025). Fails on:
 *
 *   - DRIFT — a pinned pair still name-matches but its normalized Rails body
 *     digest changed (upstream Rails moved; re-verify the port, then re-pin
 *     with `tsx body-pins.ts --pin <ruby-file>`);
 *   - STALE — a pinned pair no longer resolves (the method was removed/renamed
 *     or the pair stopped matching; drop the entry from body-pins.json);
 *   - DUPLICATE — two manifest entries share one (package, rubyFile, rubyName)
 *     key (the manifest must be a clean 1:1 record).
 *
 * A DRIFT or STALE pair with a bump-ledger row (scripts/parity/bump-ledger/,
 * RFC 0191 § 3) is reported as a ledger row and does not fail the gate;
 * lint-bump-ledger.ts keeps the ledger honest.
 *
 * Unpinned matched pairs are NOT a failure — pinning is opt-in (see
 * body-pins.ts for the lifecycle). This gate only enforces that the pins that
 * DO exist resolve and match, so it mirrors lint-call-mismatches.ts minus the
 * only-shrink ratchet (pins grow, they don't shrink).
 *
 * Usage:
 *   pnpm tsx scripts/api-compare/lint-body-pins.ts   # gate (CI)
 *
 * (Run `pnpm parity:api` first so output/body-hashes.json is fresh. Reseed
 * pins via `tsx scripts/api-compare/body-pins.ts --pin <file>`, not here.)
 *
 * Hard rules: no node:* imports, no process.* in the library surface (the CLI
 * entry guard is the sole exception), async fs only, no third-party runtime deps.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { ROOT_DIR } from "./config.js";
import { inScope, scopeMismatch, scopeOf } from "./scope.js";
import {
  MANIFEST_PATH,
  diffPins,
  findDuplicateKeys,
  keyOf,
  loadArtifact,
  loadManifest,
  missingScope,
} from "./body-pins.js";
import { loadLedgered, partitionLedgered } from "./bump-ledger.js";

/**
 * The `@inlinedFrom <Mod>#<method> <citation>` tags in every package other
 * than `scope`: a pin those credit is seen only by an unscoped compare.
 */
export async function inlinedFromOutside(
  scope: string,
): Promise<{ method: string; file: string }[]> {
  const tags: { method: string; file: string }[] = [];
  const pkgsDir = path.join(ROOT_DIR, "packages");
  for (const pkg of await fs.readdir(pkgsDir)) {
    if (pkg === scope) continue;
    const lib = path.join(pkgsDir, pkg, "lib");
    let files: string[];
    try {
      files = await fs.readdir(lib, { recursive: true });
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith(".ts")) continue;
      const text = await fs.readFile(path.join(lib, f), "utf8");
      for (const m of text.matchAll(/@inlinedFrom\s+\S+#(\S+)\s+(\S+?):\d/g)) {
        tags.push({ method: m[1], file: m[2] });
      }
    }
  }
  return tags;
}

async function main(scope: string | null): Promise<number> {
  const artifact = await loadArtifact();
  const pins = inScope(await loadManifest(), scope);

  const dups = findDuplicateKeys(pins);
  if (dups.length > 0) {
    console.error(
      `\nbody-pins gate: ${dups.length} duplicate manifest key(s):\n` +
        dups.map((d) => `  ${d}`).join("\n"),
    );
    return 1;
  }

  if (scope !== null) {
    const mismatch = scopeMismatch("body-pins gate", artifact.packages, scope);
    if (mismatch !== null) {
      console.error(mismatch);
      return 1;
    }
  }
  const absent = scope === null ? missingScope(artifact) : [];
  if (absent.length > 0) {
    console.error(
      `\nbody-pins gate: artifact compared a PARTIAL scope — missing ${absent.length} ` +
        `package(s): ${absent.join(", ")}.\nIt covers fewer packages than CI, so a ` +
        "pin for an uncompared package would look STALE. Regenerate the full surface:\n" +
        "  API_COMPARE_FORCE=1 pnpm parity:api\n",
    );
    return 1;
  }

  const all = diffPins(artifact.hashes, pins);
  const isLedgered = await loadLedgered();
  const { ledgered: driftLedgered, red: drift } = partitionLedgered(all.drift, isLedgered);
  const { ledgered: staleLedgered, red: stale } = partitionLedgered(all.stale, isLedgered);
  const ledgered = [...driftLedgered, ...staleLedgered];
  if (ledgered.length > 0) {
    console.log(
      `body-pins gate: ${ledgered.length} ledger row(s) — drifted or removed by a ref bump, ` +
        "tracked in scripts/parity/bump-ledger/:",
    );
    for (const l of ledgered.sort((a, b) => keyOf(a).localeCompare(keyOf(b)))) {
      console.log(`  ledger  ${l.package}  ${l.rubyFile}:${l.rubyName}`);
    }
  }

  let red = stale;
  if (scope !== null && !process.env.CI && stale.length > 0) {
    const tags = await inlinedFromOutside(scope);
    const outside = stale.filter((s) =>
      tags.some((t) => t.method === s.rubyName && t.file.endsWith(`/${s.rubyFile}`)),
    );
    red = stale.filter((s) => !outside.includes(s));
    if (outside.length > 0) {
      console.log(
        `body-pins gate: ${outside.length} pin(s) credited through an @inlinedFrom tag outside ` +
          `scope ${scope}, left to the unscoped run:`,
      );
      for (const s of outside.sort((a, b) => keyOf(a).localeCompare(keyOf(b)))) {
        console.log(`  outside  ${s.package}  ${s.rubyFile}:${s.rubyName}`);
      }
    }
  }

  if (drift.length === 0 && red.length === 0) {
    console.log(`body-pins gate: OK (${pins.length} pinned)`);
    return 0;
  }

  if (drift.length > 0) {
    console.error(
      `\nbody-pins gate: ${drift.length} DRIFTED pin(s) — the vendored Rails body changed.`,
    );
    console.error(
      "Re-verify the port against the new upstream body, then re-pin:\n" +
        "  tsx scripts/api-compare/body-pins.ts --pin <ruby-file>\n",
    );
    for (const d of drift.sort((a, b) => keyOf(a).localeCompare(keyOf(b)))) {
      console.error(
        `  ~ ${d.package}  ${d.rubyFile}:${d.rubyName}  ` +
          `pinned ${d.digest} → current ${d.currentDigest}`,
      );
    }
  }

  if (red.length > 0) {
    console.error(
      `\nbody-pins gate: ${red.length} STALE pin(s) — the pinned pair no longer matches.`,
    );
    console.error(
      `The method was removed/renamed or the pair stopped matching. Remove the ` +
        `entr(ies) from ${path.relative(ROOT_DIR, MANIFEST_PATH)}:\n`,
    );
    for (const s of red.sort((a, b) => keyOf(a).localeCompare(keyOf(b)))) {
      console.error(`  - ${s.package}  ${s.rubyFile}:${s.rubyName}`);
    }
  }

  return 1;
}

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(self) !== invoked) return;
  const code = await main(scopeOf(process.argv.slice(2)));
  process.exit(code);
}

void runAsScript();
