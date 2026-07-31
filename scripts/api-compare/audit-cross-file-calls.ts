import { promises as fs } from "fs";
import * as path from "path";

import { OUTPUT_DIR } from "./config.js";
import { jsEnumerableAliases } from "./enumerable-idioms.js";

export type Method = { name: string; file?: string; calls?: string[] };
export type Entity = {
  name: string;
  file: string;
  includes: string[];
  extends: string[];
  instanceMethods: Method[];
  classMethods: Method[];
};
type TsApi = {
  packages: Record<string, { classes: Record<string, Entity>; modules: Record<string, Entity> }>;
};
export type Mismatch = {
  package: string;
  tsFile: string;
  tsName: string;
  rubyFile: string;
  rubyName: string;
  missing: string[];
};

export type Bucket = "include-graph" | "collaborator" | "divergence" | "unported";

export type Row = {
  package: string;
  tsFile: string;
  tsName: string;
  rubyFile: string;
  call: string;
  bucket: Bucket;
  resolvedIn?: string;
};

type Definition = { entity: string; file: string; calls: Set<string> };

export type PackageIndex = {
  entitiesByFile: Map<string, Entity[]>;
  entitiesByName: Map<string, Entity[]>;
  definitionsByName: Map<string, Definition[]>;
};

export function buildPackageIndex(entities: Entity[]): PackageIndex {
  const index: PackageIndex = {
    entitiesByFile: new Map(),
    entitiesByName: new Map(),
    definitionsByName: new Map(),
  };
  for (const entity of entities) {
    push(index.entitiesByFile, entity.file, entity);
    push(index.entitiesByName, entity.name, entity);
    for (const method of [...entity.instanceMethods, ...entity.classMethods]) {
      push(index.definitionsByName, method.name, {
        entity: entity.name,
        file: method.file ?? entity.file,
        calls: new Set(method.calls ?? []),
      });
    }
  }
  return index;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

export function includeGraphFiles(tsFile: string, index: PackageIndex): Set<string> {
  const files = new Set<string>();
  const seen = new Set<string>();
  const queue = [...(index.entitiesByFile.get(tsFile) ?? [])];
  while (queue.length > 0) {
    const entity = queue.pop()!;
    for (const name of [...entity.includes, ...entity.extends]) {
      if (seen.has(name)) continue;
      seen.add(name);
      for (const target of index.entitiesByName.get(name) ?? []) {
        files.add(target.file);
        queue.push(target);
      }
    }
  }
  return files;
}

export function classifyRow(
  mismatch: Mismatch,
  call: string,
  index: PackageIndex,
): { bucket: Bucket; resolvedIn?: string } {
  const candidates = candidateNames(call);
  const definitions = index.definitionsByName.get(mismatch.tsName) ?? [];
  const makesCall = definitions.filter((d) => candidates.some((c) => d.calls.has(c)));
  if (makesCall.length === 0) {
    const ownIsEmpty = definitions.every((d) => d.file !== mismatch.tsFile || d.calls.size === 0);
    return { bucket: definitions.length <= 1 && ownIsEmpty ? "unported" : "divergence" };
  }
  const reachable = includeGraphFiles(mismatch.tsFile, index);
  const viaGraph = makesCall.find((d) => reachable.has(d.file));
  if (viaGraph) return { bucket: "include-graph", resolvedIn: viaGraph.file };
  return { bucket: "collaborator", resolvedIn: makesCall[0].file };
}

export function candidateNames(call: string): string[] {
  const arrow = call.indexOf("→");
  if (arrow < 0) return [];
  const mapped = call
    .slice(arrow + 1)
    .split("|")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  return [...new Set([...mapped, ...jsEnumerableAliases(call.slice(0, arrow).trim())])];
}

export function classify(mismatches: Mismatch[], indexes: Map<string, PackageIndex>): Row[] {
  const rows: Row[] = [];
  for (const mismatch of mismatches) {
    const index = indexes.get(mismatch.package);
    if (!index) continue;
    for (const call of mismatch.missing) {
      const { bucket, resolvedIn } = classifyRow(mismatch, call, index);
      rows.push({
        package: mismatch.package,
        tsFile: mismatch.tsFile,
        tsName: mismatch.tsName,
        rubyFile: mismatch.rubyFile,
        call,
        bucket,
        resolvedIn,
      });
    }
  }
  return rows;
}

export function isCrossFile(row: Row): boolean {
  return tsStem(row.tsFile) !== rubyStem(row.rubyFile);
}

function rubyStem(rubyFile: string): string {
  return rubyFile.replace(/\.rb$/, "").replace(/_/g, "-");
}

function tsStem(tsFile: string): string {
  return tsFile.replace(/\.ts$/, "");
}

function countAnyMethodInGraph(rows: Row[], indexes: Map<string, PackageIndex>): number {
  const callsByFile = new Map<string, Map<string, Set<string>>>();
  for (const [pkg, index] of indexes) {
    const perFile = new Map<string, Set<string>>();
    for (const definitions of index.definitionsByName.values()) {
      for (const definition of definitions) {
        let set = perFile.get(definition.file);
        if (!set) perFile.set(definition.file, (set = new Set()));
        for (const call of definition.calls) set.add(call);
      }
    }
    callsByFile.set(pkg, perFile);
  }
  let count = 0;
  for (const row of rows) {
    if (row.bucket !== "divergence" && row.bucket !== "unported") continue;
    const index = indexes.get(row.package);
    if (!index) continue;
    const candidates = candidateNames(row.call);
    const perFile = callsByFile.get(row.package)!;
    for (const file of includeGraphFiles(row.tsFile, index)) {
      const calls = perFile.get(file);
      if (calls && candidates.some((c) => calls.has(c))) {
        count++;
        break;
      }
    }
  }
  return count;
}

function tally<T>(values: T[], key: (value: T) => string): [string, number][] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(key(value), (counts.get(key(value)) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
}

async function main(): Promise<void> {
  const api = JSON.parse(await fs.readFile(path.join(OUTPUT_DIR, "ts-api.json"), "utf8")) as TsApi;
  const artifact = JSON.parse(
    await fs.readFile(path.join(OUTPUT_DIR, "call-mismatches-wide.json"), "utf8"),
  ) as { mismatches: Mismatch[] };

  const indexes = new Map<string, PackageIndex>();
  for (const [pkg, entry] of Object.entries(api.packages)) {
    indexes.set(
      pkg,
      buildPackageIndex([...Object.values(entry.classes), ...Object.values(entry.modules)]),
    );
  }

  const rows = classify(artifact.mismatches, indexes);
  const crossFile = rows.filter((r) => isCrossFile(r));
  const resolvable = rows.filter((r) => r.bucket !== "divergence" && r.bucket !== "unported");

  const report = {
    totalRows: rows.length,
    crossFileRows: crossFile.length,
    anyMethodInIncludeGraph: countAnyMethodInGraph(rows, indexes),
    resolvableAnywhereByName: resolvable.length,
    resolvableWrapperShaped: resolvable.filter((r) =>
      (indexes.get(r.package)!.definitionsByName.get(r.tsName) ?? [])
        .filter((d) => d.file === r.tsFile)
        .some((d) => d.calls.has(r.tsName) && d.calls.size > 3),
    ).length,
    rowsWithNoGraphEdge: rows.filter(
      (r) => includeGraphFiles(r.tsFile, indexes.get(r.package)!).size === 0,
    ).length,
    byBucket: Object.fromEntries(tally(crossFile, (r) => r.bucket)),
    allRowsByBucket: Object.fromEntries(tally(rows, (r) => r.bucket)),
    byPackage: Object.fromEntries(tally(crossFile, (r) => `${r.package}/${r.bucket}`)),
    crossFileTopFiles: Object.fromEntries(
      tally(crossFile, (r) => `${r.bucket} ${r.tsFile}`).slice(0, 20),
    ),
    resolvableTopFiles: Object.fromEntries(
      tally(resolvable, (r) => `${r.bucket} ${r.tsFile} → ${r.resolvedIn ?? "?"}`).slice(0, 20),
    ),
    divergenceTopFiles: Object.fromEntries(
      tally(
        rows.filter((r) => r.bucket === "divergence"),
        (r) => `${r.package}/${r.tsFile}`,
      ).slice(0, 20),
    ),
    unportedTopFiles: Object.fromEntries(
      tally(
        rows.filter((r) => r.bucket === "unported"),
        (r) => `${r.package}/${r.tsFile}`,
      ).slice(0, 15),
    ),
  };
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) void main();
