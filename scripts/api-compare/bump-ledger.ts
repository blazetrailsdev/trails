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
import { rubyFileToTs, rubyMethodToTs } from "../parity/conventions.js";
import { type BodyPin, type PinKey, comparePinKeys, currentDigests, keyOf } from "./body-pins.js";

export const LEDGER_DIR = path.join(ROOT_DIR, "scripts/parity/bump-ledger");

export interface LedgerRow extends PinKey {
  kind: "drift" | "removed" | "signature" | "constant";
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
    if (row.kind === "constant") continue;
    if (pin === undefined) problems.push({ row, problem: "unmatched" });
    else if (row.kind === "signature") {
      if (digest === undefined) problems.push({ row, problem: "kind" });
    } else if (pin === digest) problems.push({ row, problem: "stale" });
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

/** `vendor/sources.lock.json`'s shape, as far as the ledger reads it. */
export interface Lock {
  sources: Record<string, { ref: string }>;
}

/** The sources whose `ref` differs between two lockfiles. */
export function movedSources(a: Lock, b: Lock): string[] {
  const names = new Set([...Object.keys(a.sources), ...Object.keys(b.sources)]);
  return [...names].filter((s) => a.sources[s]?.ref !== b.sources[s]?.ref).sort();
}

/**
 * The revisions the gate diffs. `tested` is the tree CI checked out (the
 * artifact, the pins and the ledger are read from it); `base` is main's tip
 * and `head` the PR's tip; `fork` is their merge base. On a GitHub merge
 * checkout `base` is `HEAD^1` and `head` is `HEAD^2`. Without a second parent
 * (a push to main, or a local branch), `base` and `fork` are the merge base
 * with `baseBranch` and `head` is `HEAD`; on a push to main that is `HEAD`
 * itself, so nothing reads as added. A merge base that will not resolve is
 * an error, never a skipped arm.
 */
export async function resolveRevisions(
  git: (args: string[]) => Promise<string | null>,
  baseBranch: string,
): Promise<{ base: string; head: string; fork: string } | { error: string }> {
  const merge = (await git(["rev-parse", "--verify", "-q", "HEAD^2"])) !== null;
  const [base, head] = merge ? ["HEAD^1", "HEAD^2"] : [baseBranch, "HEAD"];
  const fork = (await git(["merge-base", base, head]))?.trim();
  if (!fork) {
    return {
      error:
        `bump-ledger gate: no merge base between ${base} and ${head}. The checkout is too ` +
        "shallow to judge which ledger rows and pins this PR adds: deepen the fetch or rebase.",
    };
  }
  return merge ? { base, head, fork } : { base: fork, head, fork };
}

/**
 * A PR forked before main moved a source's `ref` must not edit body-pins:
 * its pins were taken at the old ref.
 */
export function forkedBeforeRef(forkLock: Lock, baseLock: Lock, editsPins: boolean): string[] {
  return editsPins ? movedSources(forkLock, baseLock) : [];
}

/**
 * The ledger a ref-moving PR must carry: the seed, with a pair already
 * ledgered on the base keeping that row's `from` and `story`, so a second
 * bump does not erase where the drift began.
 */
export function carrySeed(
  seed: readonly Omit<LedgerRow, "story">[],
  base: readonly LedgerRow[],
): LedgerRow[] {
  const prior = new Map(base.map((r) => [keyOf(r), r]));
  return seed.map((s) => {
    const p = prior.get(keyOf(s));
    return p === undefined
      ? { ...s }
      : { ...s, from: p.from, ...(p.story ? { story: p.story } : {}) };
  });
}

/**
 * The rows a `--pin` or `--prune` cleared, and only those: a pair re-pinned
 * to its current digest, or a pin the run removed. A row that was already
 * unmatched before the run is left for lint-bump-ledger.ts to red.
 */
export function clearedRows(
  rows: readonly LedgerRow[],
  before: readonly BodyPin[],
  after: readonly BodyPin[],
  current: ReadonlyMap<string, string>,
): LedgerRow[] {
  const was = new Map(before.map((p) => [keyOf(p), p.digest]));
  const now = new Map(after.map((p) => [keyOf(p), p.digest]));
  return rows.filter((r) => {
    const k = keyOf(r);
    const prior = was.get(k);
    if (prior === undefined) return false;
    const next = now.get(k);
    return next === undefined || (next !== prior && next === current.get(k));
  });
}

/** Split DRIFT / STALE pins into the ledgered ones and the ones still red. */
export function partitionLedgered<T extends PinKey>(
  entries: readonly T[],
  isLedgered: (k: PinKey) => boolean,
): { ledgered: T[]; red: T[] } {
  return {
    ledgered: entries.filter((e) => isLedgered(e)),
    red: entries.filter((e) => !isLedgered(e)),
  };
}

/**
 * Whether this PR moves `source`'s ref: fork → head, not main's tip → head,
 * so a ref main moved after the fork is not read as a backwards bump. A PR
 * that moves a ref main also moved since the fork must rebase; otherwise
 * `from` is the base's ref, the one the base's pins were taken at (equal to
 * the fork's here), and the main-tip ledger is the only one rows can have
 * been added to since the fork.
 */
export function bumpOf(
  source: string,
  forkLock: Lock,
  baseLock: Lock,
  headLock: Lock,
): { kind: "none" } | { kind: "rebase" } | { kind: "bump"; from: string; to: string } {
  if (!movedSources(forkLock, headLock).includes(source)) return { kind: "none" };
  if (movedSources(forkLock, baseLock).includes(source)) return { kind: "rebase" };
  const from = baseLock.sources[source]?.ref;
  const to = headLock.sources[source]?.ref;
  return from === undefined || to === undefined ? { kind: "none" } : { kind: "bump", from, to };
}

/** A ratchet row's TS-side identity: the call gates key on (package, tsFile, rubyName). */
export interface TsPairKey {
  package: string;
  tsFile: string;
  rubyName: string;
}

/**
 * Which gate rows sit on a ledgered pair (RFC 0191 § 3, rule 3). `pair` reads a
 * row that carries its Ruby file; `ts` and `tsName` map a TS-side row through
 * the body-hashes records. A removed pair has no record, so a TS-side row with
 * no record of its own is ledgered when it sits in a TS file the removed
 * row's Ruby file maps to (`rubyFileToTs`, or any file a surviving pair of
 * that Ruby file is recorded in) and names the removed method, by its Ruby
 * name or a `rubyMethodToTs` spelling.
 */
export interface LedgerScope {
  pair(k: PinKey): boolean;
  /** `pair`, plus a `signature` row: only the parameter-name and block-parameter gates read it. */
  signaturePair(k: PinKey): boolean;
  ts(k: TsPairKey): boolean;
  tsName(k: { package: string; tsFile: string; tsName: string }): boolean;
  /** A TS member whose pair is a `removed` row: the extra-surface ratchet subtracts only these. */
  removedTsName(k: { package: string; tsFile: string; tsName: string }): boolean;
}

export function ledgerScope(
  rows: readonly LedgerRow[],
  hashes: readonly {
    package: string;
    rubyFile: string;
    rubyName: string;
    tsFile: string;
    tsName: string;
  }[],
): LedgerScope {
  const ledgered = new Set(
    rows.filter((r) => r.kind !== "signature" && r.kind !== "constant").map(keyOf),
  );
  const signatures = new Set(rows.filter((r) => r.kind === "signature").map(keyOf));
  const filesOf = new Map<string, Set<string>>();
  for (const h of hashes) {
    const f = `${h.package} ${h.rubyFile}`;
    filesOf.set(f, (filesOf.get(f) ?? new Set()).add(h.tsFile));
  }
  const removed = new Set<string>();
  const removedTsNames = new Set<string>();
  for (const r of rows.filter((x) => x.kind === "removed" || x.kind === "constant")) {
    const tsFiles = new Set(filesOf.get(`${r.package} ${r.rubyFile}`));
    tsFiles.add(rubyFileToTs(r.rubyFile, r.package));
    for (const tsFile of tsFiles) {
      removed.add(`${r.package} ${tsFile} ${r.rubyName}`);
      for (const n of rubyMethodToTs(r.rubyName, undefined, r.package) ?? [])
        removedTsNames.add(`${r.package} ${tsFile} ${n}`);
    }
  }
  const byTs = new Map<string, boolean>();
  const byTsName = new Map<string, boolean>();
  for (const h of hashes) {
    const hit = ledgered.has(keyOf(h));
    const t = `${h.package} ${h.tsFile} ${h.rubyName}`;
    const n = `${h.package} ${h.tsFile} ${h.tsName}`;
    byTs.set(t, (byTs.get(t) ?? false) || hit);
    byTsName.set(n, (byTsName.get(n) ?? false) || hit);
  }
  return {
    pair: (k) => ledgered.has(keyOf(k)),
    signaturePair: (k) => ledgered.has(keyOf(k)) || signatures.has(keyOf(k)),
    ts: (k) =>
      byTs.get(`${k.package} ${k.tsFile} ${k.rubyName}`) ??
      removed.has(`${k.package} ${k.tsFile} ${k.rubyName}`),
    tsName: (k) =>
      byTsName.get(`${k.package} ${k.tsFile} ${k.tsName}`) ??
      removedTsNames.has(`${k.package} ${k.tsFile} ${k.tsName}`),
    removedTsName: (k) =>
      removedTsNames.has(`${k.package} ${k.tsFile} ${k.tsName}`) ||
      removed.has(`${k.package} ${k.tsFile} ${k.tsName}`),
  };
}

/** The scope over every committed ledger; with none, nothing is ledgered and no artifact is read. */
export async function loadLedgerScope(dir = LEDGER_DIR): Promise<LedgerScope> {
  const rows = [...(await loadLedgers(dir)).values()].flat();
  if (rows.length === 0) return ledgerScope([], []);
  const { loadArtifact } = await import("./body-pins.js");
  return ledgerScope(rows, (await loadArtifact()).hashes);
}

/**
 * A `signature` row is stale once neither the parameter-name nor the
 * block-parameter artifact carries a row on its pair: the port's signature
 * agrees with the new Rails one. `lint-param-names.ts` reds these.
 */
export function staleSignatureRows(
  rows: readonly LedgerRow[],
  signatureRows: readonly PinKey[],
): LedgerRow[] {
  const live = new Set(signatureRows.map(keyOf));
  return rows.filter((r) => r.kind === "signature" && !live.has(keyOf(r)));
}

/** Split `rows` into the ones a gate counts and the ones it skips for the ledger. */
export function skipLedgered<T>(
  rows: readonly T[],
  isLedgered: (row: T) => boolean,
): { counted: T[]; skipped: T[] } {
  return {
    counted: rows.filter((r) => !isLedgered(r)),
    skipped: rows.filter((r) => isLedgered(r)),
  };
}

export function renderSkipped(gate: string, skipped: number): string {
  return `${gate}: skipped ${skipped} row(s) on a bump-ledgered pair`;
}

/**
 * The line `lint-bump-ledger.ts` prints per source on every run, which
 * `scripts/sync-stats/parse-bump-history.ts` reads into `bump_ledger_stats`:
 * `bump-ledger rows: <source> <package>:<kind>=<n> ...`, or `none`.
 */
export function summaryLine(source: string, rows: readonly LedgerRow[]): string {
  const tally = new Map<string, number>();
  for (const r of rows)
    tally.set(`${r.package}:${r.kind}`, (tally.get(`${r.package}:${r.kind}`) ?? 0) + 1);
  const cells = [...tally].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, n]) => `${k}=${n}`);
  return `bump-ledger rows: ${source} ${cells.length === 0 ? "none" : cells.join(" ")}`;
}

/**
 * A test row (RFC 0191 § 3 "The test half"), keyed as test-compare keys a
 * Rails test: package, Ruby test file, and the test's path in
 * `rails-tests.json`. A `moved` row is keyed by `toPath`, the describe path the
 * test sits under at `to`. It lives in `<source>.tests.json` beside the pair
 * ledger, so the body-pins readers never see it.
 */
export interface TestLedgerRow {
  package: string;
  rubyFile: string;
  path: string;
  kind: "changed" | "moved";
  toPath?: string;
  from: string;
  to: string;
  story?: string;
}

export function testLedgerPath(source: string, dir = LEDGER_DIR): string {
  return path.join(dir, `${source}.tests.json`);
}

export function testLedgerKey(pkg: string, rubyFile: string, testPath: string): string {
  return `${pkg} ${rubyFile} ${testPath}`;
}

export function testRowKey(r: TestLedgerRow): string {
  return testLedgerKey(r.package, r.rubyFile, r.toPath ?? r.path);
}

/** Every source's test rows; a source with no file contributes none. */
export async function loadTestLedger(dir = LEDGER_DIR): Promise<TestLedgerRow[]> {
  const out: TestLedgerRow[] = [];
  for (const s of SOURCES) {
    const text = await fs.readFile(testLedgerPath(s.name, dir), "utf-8").catch(() => null);
    if (text !== null) out.push(...(JSON.parse(text) as TestLedgerRow[]));
  }
  return out;
}

export interface TestLedgerProblem {
  row: TestLedgerRow;
  problem: "stale" | "unmatched";
}

/**
 * A test row is `unmatched` when test-compare matched no TS test to it, and
 * `stale` once the matched TS test agrees with the Rails test on every axis
 * the row suspends (count, kinds, values, gate). Only rows of `compared`
 * packages are judged, so a `--package` run does not red the others.
 */
export function testLedgerProblems(
  rows: readonly TestLedgerRow[],
  compared: ReadonlySet<string>,
  matched: ReadonlySet<string>,
  held: ReadonlySet<string>,
): TestLedgerProblem[] {
  const problems: TestLedgerProblem[] = [];
  for (const row of rows) {
    if (!compared.has(row.package)) continue;
    const k = testRowKey(row);
    if (!matched.has(k)) problems.push({ row, problem: "unmatched" });
    else if (!held.has(k)) problems.push({ row, problem: "stale" });
  }
  return problems;
}

/** A package's extra-surface totals, as far as {@link withoutRemoved} reads them. */
export interface LedgeredTotals {
  package: string;
  totalExtras: number;
  totalNovel: number;
  noCounterpartFiles: number;
  extraFiles: {
    tsFile: string;
    rubyFile: string | null;
    extras: { name: string; kind: string }[];
  }[];
}

/**
 * The package totals less every extra whose pair is a `removed` ledger row
 * (RFC 0191 § 3, rule 3): a TS member whose Ruby method the bump removed.
 * Nothing else is subtracted, so a package pinned at `novel === 0` stays
 * pinned against every other name.
 */
export function withoutRemoved<T extends LedgeredTotals>(
  packages: readonly T[],
  removedTsName: LedgerScope["removedTsName"],
): { packages: T[]; skipped: number } {
  let skipped = 0;
  const out = packages.map((p) => {
    let extras = p.totalExtras;
    let novel = p.totalNovel;
    let noCounterpart = p.noCounterpartFiles;
    for (const f of p.extraFiles) {
      const hit = f.extras.filter((e) =>
        removedTsName({ package: p.package, tsFile: f.tsFile, tsName: e.name }),
      );
      skipped += hit.length;
      extras -= hit.length;
      novel -= hit.filter((e) => e.kind === "novel").length;
      if (f.rubyFile === null && hit.length > 0 && hit.length === f.extras.length) noCounterpart--;
    }
    return { ...p, totalExtras: extras, totalNovel: novel, noCounterpartFiles: noCounterpart };
  });
  return { packages: out, skipped };
}

/**
 * A `constant` row is stale once no extra-surface name in the TS file its Ruby
 * file maps to (`rubyFileToTs`) still spells the removed constant: the port
 * dropped or renamed it. `lint-extra-surface-ratchet.ts` reds these.
 */
export function staleConstantRows(
  rows: readonly LedgerRow[],
  packages: readonly LedgeredTotals[],
): LedgerRow[] {
  const extras = new Set<string>();
  for (const p of packages)
    for (const f of p.extraFiles)
      for (const e of f.extras) extras.add(`${p.package} ${f.tsFile} ${e.name}`);
  return rows.filter(
    (r) =>
      r.kind === "constant" &&
      !extras.has(`${r.package} ${rubyFileToTs(r.rubyFile, r.package)} ${r.rubyName}`),
  );
}
