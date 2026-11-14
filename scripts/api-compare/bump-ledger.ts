/**
 * The bump ledger (RFC 0191 § 3): one `scripts/parity/bump-ledger/<source>.json`
 * per vendored source, each row a (package, rubyFile, rubyName) pair that a
 * `ref` bump drifted or removed and whose port has not been re-verified yet.
 * The ledger only shrinks: `body-pins.ts --pin <ruby-file>` deletes the rows it
 * clears, and `lint-bump-ledger.ts` reds a row that no longer names a live
 * DRIFT or STALE pin. With no ledger file, every reader sees an empty ledger.
 *
 * Hard rules: no node:* imports, no process.*, async fs only.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { SOURCES } from "../../vendor/sources.js";
import { serializeBaseline } from "./baseline-json.js";
import { ROOT_DIR } from "./config.js";
import { type BodyPin, type PinKey, comparePinKeys, currentDigests, keyOf } from "./body-pins.js";

export const LEDGER_DIR = path.join(ROOT_DIR, "scripts/parity/bump-ledger");

export interface LedgerRow extends PinKey {
  kind: "drift" | "removed";
  from: string;
  to: string;
  story?: string;
}

export function ledgerPath(source: string, dir = LEDGER_DIR): string {
  return path.join(dir, `${source}.json`);
}

/** The vendored source a package is compared from. */
export function sourceOf(packageName: string): string | undefined {
  return SOURCES.find((s) => s.packages.some((p) => p.name === packageName))?.name;
}

export async function loadLedgerFile(file: string): Promise<LedgerRow[]> {
  const text = await fs.readFile(file, "utf-8").catch(() => null);
  return text === null ? [] : (JSON.parse(text) as LedgerRow[]);
}

/** Every source's ledger rows, keyed by source name; a source with no file is absent. */
export async function loadLedgers(dir = LEDGER_DIR): Promise<Map<string, LedgerRow[]>> {
  const out = new Map<string, LedgerRow[]>();
  for (const s of SOURCES) {
    const rows = await loadLedgerFile(ledgerPath(s.name, dir));
    if (rows.length > 0) out.set(s.name, rows);
  }
  return out;
}

/** The shared "is this pair ledgered" reader the gates consult. */
export async function loadLedgered(dir = LEDGER_DIR): Promise<(k: PinKey) => boolean> {
  const keys = new Set<string>();
  for (const rows of (await loadLedgers(dir)).values()) for (const r of rows) keys.add(keyOf(r));
  return (k) => keys.has(keyOf(k));
}

export async function saveLedgerFile(file: string, rows: LedgerRow[]): Promise<void> {
  if (rows.length === 0) {
    await fs.rm(file, { force: true });
    return;
  }
  await fs.writeFile(file, serializeBaseline([...rows].sort(comparePinKeys)));
}

/**
 * The rows that still name an unresolved pin: a drift row whose pin still
 * differs from the current digest, a removed row whose pin is still in the
 * manifest. Everything else was cleared by a re-pin or a prune.
 */
export function liveRows(
  rows: readonly LedgerRow[],
  pins: readonly BodyPin[],
  current: ReadonlyMap<string, string>,
): LedgerRow[] {
  const pinned = new Map(pins.map((p) => [keyOf(p), p.digest]));
  return rows.filter((r) => {
    const digest = pinned.get(keyOf(r));
    return digest !== undefined && digest !== current.get(keyOf(r));
  });
}

export interface LedgerProblem {
  row: LedgerRow;
  problem: "stale" | "unmatched" | "kind" | "unbumped" | "seed";
}

/**
 * Red arms that need no history: a row whose pin matches the active digest
 * (stale — delete it), and a row with no matched pair (no pin to ledger, or
 * a kind that does not match what the pin's pair is now).
 */
export function checkRows(
  rows: readonly LedgerRow[],
  pins: readonly BodyPin[],
  records: Parameters<typeof currentDigests>[0],
): LedgerProblem[] {
  const pinned = new Map(pins.map((p) => [keyOf(p), p.digest]));
  const current = currentDigests(records);
  const problems: LedgerProblem[] = [];
  for (const row of rows) {
    const pin = pinned.get(keyOf(row));
    const digest = current.get(keyOf(row));
    if (pin === undefined) problems.push({ row, problem: "unmatched" });
    else if (pin === digest) problems.push({ row, problem: "stale" });
    else if ((digest === undefined) !== (row.kind === "removed"))
      problems.push({ row, problem: "kind" });
  }
  return problems;
}

/** Rows of `head` whose key `base` does not carry. */
export function addedRows(base: readonly LedgerRow[], head: readonly LedgerRow[]): LedgerRow[] {
  const seen = new Set(base.map(keyOf));
  return head.filter((r) => !seen.has(keyOf(r)));
}

/**
 * On a PR that moves a source's `ref`: the ledger must equal the seed taken
 * from the base's pins against the head's digests, less the rows the PR
 * cleared itself by re-pinning or pruning. A row on one side only is red,
 * and so is a row whose kind, `from` or `to` differs.
 */
export function seedDiff(
  ledger: readonly LedgerRow[],
  seed: readonly Omit<LedgerRow, "story">[],
): LedgerProblem[] {
  const fields = (r: Omit<LedgerRow, "story">) => `${r.kind} ${r.from} ${r.to}`;
  const want = new Map(seed.map((r) => [keyOf(r), r]));
  const have = new Map(ledger.map((r) => [keyOf(r), r]));
  const problems: LedgerProblem[] = [];
  for (const [k, r] of have) {
    const s = want.get(k);
    if (s === undefined || fields(s) !== fields(r)) problems.push({ row: r, problem: "seed" });
  }
  for (const [k, s] of want) if (!have.has(k)) problems.push({ row: s, problem: "seed" });
  return problems;
}
