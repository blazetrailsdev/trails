/**
 * The pure half of `pnpm parity:bump:dry-run` (RFC 0191 § 2 "How the size was
 * measured", § 3 "The bump ledger"): merging a candidate's Ruby manifests over
 * the active ones, deriving the ledger seed, and attributing every new gate
 * row to a seed row.
 *
 * Hard rules: no node:* imports, no process.*, no I/O.
 */

/** A body pin's identity: `body-pins.ts`'s `keyOf` grain. */
export interface PairKey {
  package: string;
  rubyFile: string;
  rubyName: string;
}

/** One `output/body-hashes.json` record. */
export interface HashRecord extends PairKey {
  tsFile: string;
  tsName: string;
  digest: string;
}

export interface Pin extends PairKey {
  digest: string;
}

export interface PairSeedRow extends PairKey {
  kind: "drift" | "removed";
  from: string;
  to: string;
}

export interface TestSeedRow {
  package: string;
  rubyFile: string;
  path: string;
  kind: "changed" | "moved";
  from: string;
  to: string;
}

export interface RubyTestCase {
  path: string;
  description: string;
  file: string;
  ancestors?: string[];
  [field: string]: unknown;
}

export interface RubyTestManifest {
  packages: Record<string, { files: { file: string; testCases: RubyTestCase[] }[] }>;
  [field: string]: unknown;
}

export function pairKey(k: PairKey): string {
  return `${k.package} ${k.rubyFile} ${k.rubyName}`;
}

/**
 * The active manifest with `packages`' entries replaced by the candidate's.
 * A package the candidate lacks is dropped, as a bump that removes a gem
 * would drop it; every other source's package is the active one.
 */
export function mergeManifest<M extends { packages: Record<string, unknown> }>(
  active: M,
  candidate: M,
  packages: readonly string[],
): M {
  const merged: Record<string, unknown> = { ...active.packages };
  for (const name of packages) {
    if (name in candidate.packages) merged[name] = candidate.packages[name];
    else delete merged[name];
  }
  return { ...active, packages: merged };
}

/** The DRIFT and STALE pins of `pins` against the candidate's digests. */
export function pairSeed(
  pins: readonly Pin[],
  candidate: readonly HashRecord[],
  from: string,
  to: string,
): PairSeedRow[] {
  const current = new Map(candidate.map((r) => [pairKey(r), r.digest]));
  const rows: PairSeedRow[] = [];
  for (const pin of pins) {
    const digest = current.get(pairKey(pin));
    if (digest === pin.digest) continue;
    const kind = digest === undefined ? "removed" : "drift";
    rows.push({
      package: pin.package,
      rubyFile: pin.rubyFile,
      rubyName: pin.rubyName,
      kind,
      from,
      to,
    });
  }
  return rows.sort((a, b) => cmp(pairKey(a), pairKey(b)));
}

/** What test-compare compares: everything a case carries but its location. */
export function testSignature(tc: RubyTestCase): string {
  const { line: _line, file: _file, ...rest } = tc;
  return stableJson(rest);
}

function testIndex(manifest: RubyTestManifest, pkg: string): Map<string, RubyTestCase> {
  const out = new Map<string, RubyTestCase>();
  for (const file of manifest.packages[pkg]?.files ?? []) {
    for (const tc of file.testCases) out.set(`${file.file} ${tc.path}`, tc);
  }
  return out;
}

export interface TestDelta {
  before: number;
  after: number;
  added: number;
  removed: number;
  changed: string[];
  moved: string[];
}

/**
 * Per-package test delta between two `rails-tests.json` manifests. A test is
 * `moved` when a removed path's description and file reappear under a new
 * describe path, and `changed` when its path survives with a new signature.
 */
export function testDelta(
  active: RubyTestManifest,
  candidate: RubyTestManifest,
  pkg: string,
): TestDelta {
  const a = testIndex(active, pkg);
  const c = testIndex(candidate, pkg);
  const changed: string[] = [];
  const removedKeys: string[] = [];
  for (const [key, tc] of a) {
    const next = c.get(key);
    if (next === undefined) removedKeys.push(key);
    else if (testSignature(tc) !== testSignature(next)) changed.push(key);
  }
  const addedKeys = [...c.keys()].filter((k) => !a.has(k));
  const addedByName = new Map<string, string>();
  for (const k of addedKeys) {
    const tc = c.get(k)!;
    addedByName.set(`${tc.file} ${tc.description}`, k);
  }
  const moved: string[] = [];
  for (const k of removedKeys) {
    const tc = a.get(k)!;
    if (addedByName.has(`${tc.file} ${tc.description}`)) moved.push(k);
  }
  return {
    before: a.size,
    after: c.size,
    added: addedKeys.length - moved.length,
    removed: removedKeys.length - moved.length,
    changed: changed.sort(),
    moved: moved.sort(),
  };
}

/**
 * The test half of the seed: a changed or moved test whose Rails file
 * test-compare matched and whose description it did not report missing.
 * `missing` maps `<package> <rubyFile>` to that file's missing descriptions;
 * a file absent from it has no convention TS file and matches nothing.
 */
export function testSeed(
  pkg: string,
  delta: TestDelta,
  active: RubyTestManifest,
  missing: ReadonlyMap<string, ReadonlySet<string>>,
  from: string,
  to: string,
): TestSeedRow[] {
  const index = testIndex(active, pkg);
  const rows: TestSeedRow[] = [];
  const add = (keys: string[], kind: TestSeedRow["kind"]) => {
    for (const key of keys) {
      const tc = index.get(key)!;
      const fileMissing = missing.get(`${pkg} ${tc.file}`);
      if (fileMissing === undefined || fileMissing.has(tc.description)) continue;
      rows.push({ package: pkg, rubyFile: tc.file, path: tc.path, kind, from, to });
    }
  };
  add(delta.changed, "changed");
  add(delta.moved, "moved");
  return rows;
}

/** A gate row: any object of a gate artifact naming a package and TS file. */
export interface GateRow {
  package: string;
  tsFile: string;
  rubyName?: string;
  tsName?: string;
  [field: string]: unknown;
}

/** Every row-shaped object in a gate artifact, at any depth. */
export function gateRows(artifact: unknown): GateRow[] {
  const out: GateRow[] = [];
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) {
      for (const item of x) walk(item);
    } else if (x !== null && typeof x === "object") {
      const o = x as Record<string, unknown>;
      if (typeof o.package === "string" && typeof o.tsFile === "string") out.push(o as GateRow);
      else for (const v of Object.values(o)) walk(v);
    }
  };
  walk(artifact);
  return out;
}

/** The rows of `candidate` that `active` does not carry. */
export function newRows(active: readonly GateRow[], candidate: readonly GateRow[]): GateRow[] {
  const seen = new Set(active.map(stableJson));
  return candidate.filter((r) => !seen.has(stableJson(r)));
}

export type Attribution = "drift" | "removed" | "unpinnedChanged" | "fileSeed";

export interface Attributed {
  row: GateRow;
  attribution: Attribution | null;
}

/**
 * Attribute each new row to the seed. A row naming a method is looked up as
 * the pair `body-hashes.json` records for its (package, tsFile, rubyName); it
 * is a seed row's if that pair is in the seed, `unpinnedChanged` if the pair
 * has no pin but its digest moved. A row naming no method (extra surface) is
 * the file's if any seed pair maps to its TS file. Anything else is residue.
 */
export function attribute(
  rows: readonly GateRow[],
  seed: readonly PairSeedRow[],
  active: readonly HashRecord[],
  candidate: readonly HashRecord[],
): Attributed[] {
  const seedKind = new Map(seed.map((s) => [pairKey(s), s.kind]));
  const byTs = new Map<string, HashRecord[]>();
  for (const r of [...candidate, ...active]) {
    const k = `${r.package} ${r.tsFile} ${r.rubyName}`;
    byTs.set(k, [...(byTs.get(k) ?? []), r]);
  }
  const activeDigest = new Map(active.map((r) => [pairKey(r), r.digest]));
  const candidateDigest = new Map(candidate.map((r) => [pairKey(r), r.digest]));
  const seedFiles = new Set<string>();
  for (const r of [...candidate, ...active]) {
    if (seedKind.has(pairKey(r))) seedFiles.add(`${r.package} ${r.tsFile}`);
  }
  return rows.map((row) => {
    if (row.rubyName === undefined) {
      return {
        row,
        attribution: seedFiles.has(`${row.package} ${row.tsFile}`) ? "fileSeed" : null,
      };
    }
    let attribution: Attribution | null = null;
    for (const pair of byTs.get(`${row.package} ${row.tsFile} ${row.rubyName}`) ?? []) {
      const kind = seedKind.get(pairKey(pair));
      if (kind !== undefined) return { row, attribution: kind };
      if (activeDigest.get(pairKey(pair)) !== candidateDigest.get(pairKey(pair))) {
        attribution = "unpinnedChanged";
      }
    }
    return { row, attribution };
  });
}

/** A markdown table, RFC 0191 § 2's shape. */
export function table(header: readonly string[], rows: readonly (string | number)[][]): string {
  const line = (cells: readonly (string | number)[]) => `| ${cells.join(" | ")} |`;
  return [line(header), line(header.map(() => "---")), ...rows.map(line)].join("\n");
}

export function stableJson(x: unknown): string {
  return JSON.stringify(x, (_k, v) =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => cmp(a, b)))
      : v,
  );
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
