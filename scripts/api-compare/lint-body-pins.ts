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
 * Unpinned matched pairs are NOT a failure — pinning is opt-in (see
 * body-pins.ts for the lifecycle). This gate only enforces that the pins that
 * DO exist resolve and match, so it mirrors lint-call-mismatches.ts minus the
 * only-shrink ratchet (pins grow, they don't shrink).
 *
 * Usage:
 *   pnpm tsx scripts/api-compare/lint-body-pins.ts   # gate (CI)
 *
 * (Run `pnpm api:compare` first so output/body-hashes.json is fresh. Reseed
 * pins via `tsx scripts/api-compare/body-pins.ts --pin <file>`, not here.)
 *
 * Hard rules: no node:* imports, no process.* in the library surface (the CLI
 * entry guard is the sole exception), async fs only, no third-party runtime deps.
 */

import * as path from "path";
import { fileURLToPath } from "url";
import { ROOT_DIR } from "./config.js";
import {
  MANIFEST_PATH,
  diffPins,
  findDuplicateKeys,
  keyOf,
  loadArtifact,
  loadManifest,
  missingScope,
} from "./body-pins.js";

async function main(): Promise<number> {
  const artifact = await loadArtifact();
  const pins = await loadManifest();

  const dups = findDuplicateKeys(pins);
  if (dups.length > 0) {
    console.error(
      `\nbody-pins gate: ${dups.length} duplicate manifest key(s):\n` +
        dups.map((d) => `  ${d}`).join("\n"),
    );
    return 1;
  }

  const absent = missingScope(artifact);
  if (absent.length > 0) {
    console.error(
      `\nbody-pins gate: artifact compared a PARTIAL scope — missing ${absent.length} ` +
        `package(s): ${absent.join(", ")}.\nIt covers fewer packages than CI, so a ` +
        "pin for an uncompared package would look STALE. Regenerate the full surface:\n" +
        "  API_COMPARE_FORCE=1 pnpm api:compare\n",
    );
    return 1;
  }

  const { drift, stale } = diffPins(artifact.hashes, pins);

  if (drift.length === 0 && stale.length === 0) {
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

  if (stale.length > 0) {
    console.error(
      `\nbody-pins gate: ${stale.length} STALE pin(s) — the pinned pair no longer matches.`,
    );
    console.error(
      `The method was removed/renamed or the pair stopped matching. Remove the ` +
        `entr(ies) from ${path.relative(ROOT_DIR, MANIFEST_PATH)}:\n`,
    );
    for (const s of stale.sort((a, b) => keyOf(a).localeCompare(keyOf(b)))) {
      console.error(`  - ${s.package}  ${s.rubyFile}:${s.rubyName}`);
    }
  }

  return 1;
}

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(self) !== invoked) return;
  const code = await main();
  process.exit(code);
}

void runAsScript();
