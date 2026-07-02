#!/usr/bin/env npx tsx
/**
 * Source-hash pinning for api:compare (RFC 0025-fidelity-verification-tooling).
 *
 * api:compare validates method NAMES (plus advisory arity / option-keys /
 * literals / call-set), but nothing records WHICH Rails source a matched TS
 * method was ported against. So when `vendor/rails` is bumped, methods whose
 * Ruby bodies changed upstream rot silently, and a green name-match can't be
 * told apart from a faithful port.
 *
 * Fix: pin the normalized Rails body digest per matched pair.
 *
 * ── Pin lifecycle ───────────────────────────────────────────────────────────
 *   port → verify → pin → (Rails bump) → drift report → re-verify → re-pin
 *
 *   1. PORT a Rails method to TS; api:compare name-matches the pair and writes
 *      its current Ruby body digest to output/body-hashes.json.
 *   2. VERIFY the port is faithful (a convergence story, review, or test).
 *   3. PIN it: `tsx body-pins.ts --pin <ruby-file>` records the current digest
 *      into body-pins.json. `--pin-all` pins every matched pair at once (the
 *      bulk floor — the current vendored tree is the de-facto baseline).
 *   4. On a RAILS BUMP the vendored body changes → its digest changes →
 *      lint-body-pins.ts reports DRIFT for that pin (pinned ≠ current).
 *   5. RE-VERIFY the port against the new upstream body.
 *   6. RE-PIN (`--pin <file>`) to record the new digest and clear the drift.
 *
 * A pin whose method was removed/renamed (no longer a matched pair) is STALE;
 * lint-body-pins.ts fails on it so the manifest stays a live record. Pins are
 * OPT-IN and only grow — there is no only-shrink ratchet here (unlike
 * call-mismatches); the gate instead enforces that every pin resolves and
 * matches.
 *
 * The body digest itself is emitted by extract-ruby-api.rb#body_digest: it
 * hashes the def BODY sexp with scanner-token positions stripped, so it is
 * insensitive to indentation, blank lines, and comments — only a change to the
 * code the body runs moves it.
 *
 * Usage:
 *   tsx body-pins.ts --pin <ruby-file>   # pin/re-pin all pairs in one Ruby file
 *   tsx body-pins.ts --pin-all           # pin/re-pin every matched pair (floor)
 *   tsx body-pins.ts                      # list pin/unpinned counts (no writes)
 *
 * (Run `pnpm api:compare` first so output/body-hashes.json is fresh.)
 *
 * Hard rules: no node:* imports, no process.* in the library surface (the CLI
 * entry guard is the sole exception, matching lint-call-mismatches.ts), async
 * fs only, no third-party runtime deps.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { OUTPUT_DIR, PACKAGES, ROOT_DIR, SCRIPT_DIR } from "./config.js";

export const ARTIFACT_PATH = path.join(OUTPUT_DIR, "body-hashes.json");
export const MANIFEST_PATH = path.join(SCRIPT_DIR, "body-pins.json");

// One name-matched pair's current normalized Ruby body digest, as written to
// output/body-hashes.json by compare.ts.
export interface BodyHashRecord {
  package: string;
  rubyFile: string;
  rubyName: string;
  tsFile: string;
  tsName: string;
  digest: string;
}

export interface Artifact {
  // Packages this run compared (compare.ts writes it sorted). A partial-scope
  // artifact must not drive the gate/generator — see missingScope.
  packages?: string[];
  hashes: BodyHashRecord[];
}

// One pinned pair. Identity keys off (package, rubyFile, rubyName) — the same
// grain compare.ts uses. `reason` documents the verification that justified the
// pin (a convergence story id, a PR, a review note).
export interface BodyPin {
  package: string;
  rubyFile: string;
  rubyName: string;
  digest: string;
  reason?: string;
}

export interface PinKey {
  package: string;
  rubyFile: string;
  rubyName: string;
}

export function keyOf(k: PinKey): string {
  return `${k.package} ${k.rubyFile} ${k.rubyName}`;
}

// Packages that SHOULD have been compared but are absent from the artifact —
// the signature of a partial-scope run (a `--package` filter, an unfetched
// vendor source, or an artifact predating the field). Gating/generating from a
// partial artifact would flag every uncompared package's pins as STALE.
export function missingScope(artifact: Artifact, expected: readonly string[] = PACKAGES): string[] {
  const present = new Set(artifact.packages ?? []);
  return expected.filter((p) => !present.has(p)).sort();
}

export interface DriftEntry extends BodyPin {
  currentDigest: string;
}

export interface DiffResult {
  drift: DriftEntry[]; // pinned pair still matches but its body digest changed
  stale: BodyPin[]; // pinned pair no longer resolves (removed / renamed / unmatched)
}

// A body-hashes artifact can carry several records for one (package, rubyFile,
// rubyName) key when a Ruby method maps to multiple TS candidates. They share
// the same source method, hence the same digest, so collapsing to the first is
// safe (and keeps the pin manifest a clean 1:1 record).
export function currentDigests(records: BodyHashRecord[]): Map<string, string> {
  const byKey = new Map<string, string>();
  for (const r of records) {
    const key = keyOf(r);
    if (!byKey.has(key)) byKey.set(key, r.digest);
  }
  return byKey;
}

export function diffPins(records: BodyHashRecord[], pins: BodyPin[]): DiffResult {
  const current = currentDigests(records);
  const drift: DriftEntry[] = [];
  const stale: BodyPin[] = [];
  for (const pin of pins) {
    const currentDigest = current.get(keyOf(pin));
    if (currentDigest === undefined) {
      stale.push(pin);
    } else if (currentDigest !== pin.digest) {
      drift.push({ ...pin, currentDigest });
    }
  }
  return { drift, stale };
}

export function findDuplicateKeys(pins: BodyPin[]): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const p of pins) {
    const k = keyOf(p);
    if (seen.has(k)) dups.add(k);
    seen.add(k);
  }
  return [...dups];
}

function sortPins(pins: BodyPin[]): BodyPin[] {
  return [...pins].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
}

// Pin (or re-pin) matched pairs at their CURRENT digest. `select` limits which
// records to (re)pin: a specific Ruby file, or all of them (`--pin-all`). Pins
// outside the selection are preserved untouched; a re-pinned entry keeps its
// prior `reason`. Returns the sorted next manifest.
export function pinPairs(
  records: BodyHashRecord[],
  pins: BodyPin[],
  select: { rubyFile: string } | { all: true },
): BodyPin[] {
  const byKey = new Map<string, BodyPin>(pins.map((p) => [keyOf(p), p]));
  for (const r of records) {
    if ("rubyFile" in select && r.rubyFile !== select.rubyFile) continue;
    const key = keyOf(r);
    // Records dedupe to one pin per key (a Ruby method can appear under several
    // TS candidates, all sharing its body digest); first sighting wins.
    if (byKey.get(key)?.digest === r.digest) continue;
    const prior = byKey.get(key);
    byKey.set(key, {
      package: r.package,
      rubyFile: r.rubyFile,
      rubyName: r.rubyName,
      digest: r.digest,
      reason: prior?.reason,
    });
  }
  return sortPins([...byKey.values()]);
}

export async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, "utf-8")) as T;
}

export async function loadManifest(): Promise<BodyPin[]> {
  const exists = await fs.access(MANIFEST_PATH).then(
    () => true,
    () => false,
  );
  if (!exists) return [];
  return readJson<BodyPin[]>(MANIFEST_PATH);
}

export async function loadArtifact(): Promise<Artifact> {
  const exists = await fs.access(ARTIFACT_PATH).then(
    () => true,
    () => false,
  );
  if (!exists) {
    throw new Error(
      `Missing ${path.relative(ROOT_DIR, ARTIFACT_PATH)} — run \`pnpm api:compare\` ` +
        "first to write the body-hashes artifact.",
    );
  }
  return readJson<Artifact>(ARTIFACT_PATH);
}

export async function saveManifest(pins: BodyPin[]): Promise<void> {
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(sortPins(pins), null, 2) + "\n");
}

async function main(args: string[]): Promise<number> {
  const artifact = await loadArtifact();
  const pins = await loadManifest();

  const absent = missingScope(artifact);
  if (absent.length > 0) {
    console.error(
      `\nbody-pins: artifact compared a PARTIAL scope — missing ${absent.length} ` +
        `package(s): ${absent.join(", ")}.\nRegenerate the full surface first: ` +
        "`API_COMPARE_FORCE=1 pnpm api:compare`.\n",
    );
    return 1;
  }

  const pinAll = args.includes("--pin-all");
  const pinIdx = args.indexOf("--pin");
  const pinFile = pinIdx >= 0 ? args[pinIdx + 1] : undefined;

  if (pinAll || pinFile) {
    const next = pinAll
      ? pinPairs(artifact.hashes, pins, { all: true })
      : pinPairs(artifact.hashes, pins, { rubyFile: pinFile! });
    await saveManifest(next);
    console.log(
      `Wrote ${path.relative(ROOT_DIR, MANIFEST_PATH)}: ${next.length} pinned pair(s)` +
        (pinFile ? ` (pinned/re-pinned ${pinFile})` : " (pinned all matched pairs)"),
    );
    return 0;
  }

  const total = currentDigests(artifact.hashes).size;
  console.log(`body-pins: ${pins.length} pinned / ${total} matched pair(s)`);
  return 0;
}

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(self) !== invoked) return;
  const code = await main(process.argv.slice(2));
  process.exit(code);
}

void runAsScript();
