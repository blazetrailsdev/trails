import { promises as fs } from "fs";
import * as path from "path";

import { OUTPUT_DIR } from "./config.js";
import { jsEnumerableAliases } from "./enumerable-idioms.js";
import {
  buildIncludeGraph,
  includeGraphEntities,
  type GraphEntity,
  type IncludeGraph,
} from "./include-graph.js";

// Mirrors the gate's own, unexported DELEGATION_MAX_CALLS (compare.ts:295) —
// keep in step if that threshold ever moves.
const DELEGATION_MAX_CALLS = 3;

export type Method = { name: string; file?: string; calls?: string[] };
export type Entity = {
  name: string;
  file: string;
  reExportedFrom?: string;
  includes: string[];
  extends: string[];
  delegatesTo?: string[];
  instanceMethods: Method[];
  classMethods: Method[];
};
type TsApi = {
  packages: Record<
    string,
    {
      classes: Record<string, Entity>;
      modules: Record<string, Entity>;
      fileFunctions: Record<string, Method[]>;
    }
  >;
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

type Definition = { name: string; owner: string; file: string; calls: Set<string> };

export type PackageIndex = {
  graph: IncludeGraph;
  definitionsByName: Map<string, Definition[]>;
  definitionsByOwner: Map<string, Definition[]>;
};

export type EdgeKind = "include" | "delegation";

export type Resolution = {
  entity: string;
  file: string;
  edgeKind: EdgeKind;
  methods: string[];
};

export type LooseRow = Row & { resolutions: Resolution[] };

/**
 * An entity's own methods sit under `<file>:<name>`; a file's mixed-in
 * `this`-typed functions sit under `fn:<file>` and are credited to every entity
 * declared in that file — the same two sources `includeGraphCallSets` unions,
 * and no wider. Keying by ENTITY rather than by file is what keeps a barrel
 * (`cache/index.ts`, which holds a re-exported entry for every store) from
 * letting `MemoryStore#deleteMatched` discharge a call missing from
 * `FileStore#deleteMatched`.
 */
function ownersOf(entity: GraphEntity): string[] {
  return [entityKey(entity), `fn:${entity.file}`];
}

function entityKey(entity: GraphEntity): string {
  return `${entity.file}:${entity.name}`;
}

export function buildPackageIndex(
  entities: Entity[],
  fileFunctions: Record<string, Method[]> = {},
): PackageIndex {
  const index: PackageIndex = {
    graph: buildIncludeGraph(entities, fileFunctions),
    definitionsByName: new Map(),
    definitionsByOwner: new Map(),
  };
  const record = (definition: Definition): void => {
    push(index.definitionsByName, definition.name, definition);
    push(index.definitionsByOwner, definition.owner, definition);
  };
  for (const entity of entities) {
    for (const method of [...entity.instanceMethods, ...entity.classMethods]) {
      record({
        name: method.name,
        owner: `${entity.file}:${entity.name}`,
        file: method.file ?? entity.file,
        calls: new Set(method.calls ?? []),
      });
    }
  }
  for (const [file, methods] of Object.entries(fileFunctions)) {
    for (const method of methods) {
      record({
        name: method.name,
        owner: `fn:${file}`,
        file: method.file ?? file,
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

export function includeGraphOwners(tsFile: string, index: PackageIndex): Set<string> {
  return new Set(reachableEntities(tsFile, index, false).flatMap(([e]) => ownersOf(e)));
}

/**
 * The entities `tsFile` reaches, through the SHIPPED gate walk
 * (`includeGraphEntities`): per-entity, and dropping an edge name that resolves
 * to more than one entity. The audit measured a file-level, ambiguity-blind
 * variant of this walk first; PR #5755 showed both readings over-resolve, so the
 * audit now reports what the gate actually credits.
 */
export function reachableEntities(
  tsFile: string,
  index: PackageIndex,
  delegation: boolean,
): [GraphEntity, EdgeKind][] {
  const includeOnly = delegation
    ? new Set(includeGraphEntities(tsFile, index.graph).map(entityKey))
    : new Set<string>();
  return includeGraphEntities(tsFile, index.graph, { delegation }).map((entity) => [
    entity,
    delegation && !includeOnly.has(entityKey(entity)) ? "delegation" : "include",
  ]);
}

function definitionsOf(entity: GraphEntity, index: PackageIndex): Definition[] {
  return ownersOf(entity).flatMap((owner) => index.definitionsByOwner.get(owner) ?? []);
}

export function looseOnlyRows(
  rows: Row[],
  indexes: Map<string, PackageIndex>,
  delegation: boolean,
): LooseRow[] {
  const loose: LooseRow[] = [];
  for (const row of rows) {
    if (row.bucket !== "divergence" && row.bucket !== "unported") continue;
    const index = indexes.get(row.package);
    if (!index) continue;
    const candidates = candidateNames(row.call);
    const resolutions: Resolution[] = [];
    for (const [entity, edgeKind] of reachableEntities(row.tsFile, index, delegation)) {
      const makers = definitionsOf(entity, index).filter((d) =>
        candidates.some((c) => d.calls.has(c)),
      );
      if (makers.length === 0) continue;
      resolutions.push({
        entity: entity.name,
        file: entity.file ?? "",
        edgeKind,
        methods: [...new Set(makers.map((d) => d.name))].sort(),
      });
    }
    if (resolutions.length === 0) continue;
    resolutions.sort((a, b) => a.file.localeCompare(b.file) || a.entity.localeCompare(b.entity));
    loose.push({ ...row, resolutions });
  }
  return loose;
}

export function adapterFamily(file: string): string | undefined {
  return [/postgresql/, /mysql|mariadb/, /sqlite/].find((re) => re.test(file))?.source;
}

export function crossesAdapterFamilies(row: LooseRow): boolean {
  const own = adapterFamily(row.tsFile);
  return (
    own !== undefined &&
    row.resolutions.some((r) => {
      const other = adapterFamily(r.file);
      return other !== undefined && other !== own;
    })
  );
}

export function edgeKindOf(row: LooseRow): EdgeKind {
  return row.resolutions.some((r) => r.edgeKind === "include") ? "include" : "delegation";
}

export function sameNameGraphRows(
  rows: Row[],
  indexes: Map<string, PackageIndex>,
  delegation: boolean,
): Row[] {
  return rows.filter((row) => {
    const index = indexes.get(row.package);
    if (!index) return false;
    const candidates = candidateNames(row.call);
    const owners = new Set(
      reachableEntities(row.tsFile, index, delegation).flatMap(([e]) => ownersOf(e)),
    );
    return (index.definitionsByName.get(row.tsName) ?? []).some(
      (d) => owners.has(d.owner) && candidates.some((c) => d.calls.has(c)),
    );
  });
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
    const own = definitions.filter((d) => d.file === mismatch.tsFile);
    const hollow = own.length === definitions.length && own.every((d) => d.calls.size === 0);
    return { bucket: own.length > 0 && hollow ? "unported" : "divergence" };
  }
  const owners = includeGraphOwners(mismatch.tsFile, index);
  const viaGraph = makesCall.find((d) => owners.has(d.owner));
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
      buildPackageIndex(
        [...Object.values(entry.classes), ...Object.values(entry.modules)],
        entry.fileFunctions,
      ),
    );
  }

  const rows = classify(artifact.mismatches, indexes);
  const crossFile = rows.filter((r) => isCrossFile(r));
  const resolvable = rows.filter((r) => r.bucket !== "divergence" && r.bucket !== "unported");
  const looseWithDelegation = looseOnlyRows(rows, indexes, true);

  if (process.argv.includes("--loose-sample")) {
    for (const row of looseWithDelegation) console.log(JSON.stringify(row));
    return;
  }

  const report = {
    totalRows: rows.length,
    crossFileRows: crossFile.length,
    anyMethodInIncludeGraph: looseOnlyRows(rows, indexes, false).length,
    anyMethodInDelegationGraph: looseWithDelegation.length,
    sameNameInIncludeGraph: sameNameGraphRows(rows, indexes, false).length,
    sameNameInDelegationGraph: sameNameGraphRows(rows, indexes, true).length,
    anyMethodByEdgeKind: Object.fromEntries(tally(looseWithDelegation, edgeKindOf)),
    anyMethodCrossingAdapterFamilies: looseWithDelegation.filter(crossesAdapterFamilies).length,
    anyMethodWithSameNamedResolver: looseWithDelegation.filter((r) =>
      r.resolutions.some((res) => res.methods.includes(r.tsName)),
    ).length,
    resolvableAnywhereByName: resolvable.length,
    resolvableForwardersAboveDelegationCap: resolvable.filter((r) =>
      (indexes.get(r.package)!.definitionsByName.get(r.tsName) ?? [])
        .filter((d) => d.file === r.tsFile)
        .some((d) => d.calls.has(r.tsName) && d.calls.size > DELEGATION_MAX_CALLS),
    ).length,
    rowsWithNoGraphEdge: rows.filter(
      (r) => includeGraphOwners(r.tsFile, indexes.get(r.package)!).size === 0,
    ).length,
    rowsWithNoDefinition: rows.filter(
      (r) => (indexes.get(r.package)!.definitionsByName.get(r.tsName) ?? []).length === 0,
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
