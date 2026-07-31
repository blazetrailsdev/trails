import { partitionNegatedCalls } from "./enumerable-idioms.js";
import type { ClassInfo, MethodInfo } from "./types.js";

/**
 * The include/extends graph the wide calls-parity gate resolves candidates
 * through (RFC 0083).
 *
 * Rails attributes a mixed-in module's methods to the INCLUDING class's file,
 * so a Ruby method that lives in `postgresql/schema_statements.rb` is
 * name-matched against `postgresql-adapter.ts` and charged with the whole
 * mixin's call set. When trails ports that body onto a class the paired class
 * genuinely reaches — through a recorded `includes` / `extends` edge — the
 * omission is an attribution artifact, not a dropped call.
 *
 * The walk is over the RECORDED edge names in `ts-api.json` only. It must not
 * resolve through filename or directory proximity, nor through "a body of this
 * name anywhere in the package": the cross-file audit
 * (`rfcs/0083-.../cross-file-audit.md`) measured that looser rule crediting
 * `abstract-mysql-adapter.ts` with calls made in
 * `postgresql/schema-statements-class.ts`, and `cache/file-store.ts` with
 * `cache/memory-store.ts` — sibling implementations of one interface, where a
 * per-adapter dropped step is exactly what the gate exists to catch. An edge
 * naming no entity in the package (a cross-package mixin, an inline object
 * literal) drops out of the walk silently; it never falls back to a looser
 * match.
 */
export interface IncludeGraph {
  entitiesByFile: Map<string, ClassInfo[]>;
  entitiesByName: Map<string, ClassInfo[]>;
  fileFunctions: Record<string, MethodInfo[]>;
}

/**
 * Index one package's classes and modules by file and by name. Package-scoped
 * by design — an edge that resolves only in a dep package is out of scope, so
 * cross-package name collisions cannot lend a call-set.
 *
 * A barrel re-export (`cache/index.ts` → `cache/store.ts:Store`) collapses onto
 * its ORIGIN entity, so a name backed by one real declaration stays
 * unambiguous however many barrels re-export it, and `index.ts:DatabaseAdapter`
 * still resolves the alias it re-exports.
 */
export function buildIncludeGraph(
  entities: Iterable<ClassInfo>,
  fileFunctions: Record<string, MethodInfo[]> = {},
): IncludeGraph {
  const all = [...entities].filter((e) => (e.file ?? "") !== "");
  const byKey = new Map<string, ClassInfo>();
  for (const entity of all) byKey.set(`${entity.file}:${entity.name}`, entity);
  const origin = (entity: ClassInfo): ClassInfo => {
    const seen = new Set<string>();
    let current = entity;
    while (current.reExportedFrom !== undefined && !seen.has(current.reExportedFrom)) {
      seen.add(current.reExportedFrom);
      const next = byKey.get(current.reExportedFrom);
      if (!next) break;
      current = next;
    }
    return current;
  };

  const entitiesByFile = new Map<string, ClassInfo[]>();
  const entitiesByName = new Map<string, ClassInfo[]>();
  const namedKeys = new Map<string, Set<string>>();
  for (const entity of all) {
    push(entitiesByFile, entity.file!, entity);
    const target = origin(entity);
    const keys = namedKeys.get(entity.name) ?? new Set<string>();
    const key = `${target.file}:${target.name}`;
    if (!keys.has(key)) {
      keys.add(key);
      namedKeys.set(entity.name, keys);
      push(entitiesByName, entity.name, target);
    }
  }
  return { entitiesByFile, entitiesByName, fileFunctions };
}

function push<V>(map: Map<string, V[]>, key: string, value: V): void {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

/**
 * Entities reachable from `tsFile` by the transitive closure of recorded
 * `includes` / `extends` names. Entities declared in `tsFile` itself are never
 * returned — the caller already holds its own file's call-sets.
 */
export function includeGraphEntities(tsFile: string, graph: IncludeGraph): ClassInfo[] {
  const reached: ClassInfo[] = [];
  const seenEdges = new Set<string>();
  const queue = [...(graph.entitiesByFile.get(tsFile) ?? [])];
  while (queue.length > 0) {
    const entity = queue.pop()!;
    for (const name of [...entity.includes, ...entity.extends]) {
      if (seenEdges.has(name)) continue;
      seenEdges.add(name);
      const targets = graph.entitiesByName.get(name) ?? [];
      // An ambiguous edge name is dropped, not disambiguated: `DatabaseStatements`
      // names a module under abstract/, mysql/ AND sqlite3/, so following all of
      // them credits one adapter with another's calls, and picking one by path
      // proximity is exactly the filename heuristic this resolution must not use.
      if (targets.length !== 1) continue;
      const target = targets[0];
      if ((target.file ?? "") !== tsFile) reached.push(target);
      queue.push(target);
    }
  }
  return reached;
}

/**
 * The call-sets of same-named bodies on entities reachable from `tsFile`.
 *
 * Resolution is per-ENTITY, not per-file: a barrel (`cache/index.ts`) holds a
 * re-exported entry for every store in the package, so unioning a reached
 * FILE's methods by name would let `MemoryStore#deleteMatched` discharge a call
 * missing from `FileStore#deleteMatched` — the sibling-implementation
 * cross-credit the cross-file audit rejected. A reached entity's own file
 * functions ARE included: trails' `include` convention (CLAUDE.md) ports a
 * mixin's bodies as `this`-typed file functions that the entity re-binds, so
 * the real body lives there and nowhere else.
 */
export function includeGraphCallSets(
  tsFile: string,
  tsName: string,
  graph: IncludeGraph,
): { calls: Set<string>; negated: Set<string> } {
  const raw: string[] = [];
  const seenFileFunctionFiles = new Set<string>();
  for (const entity of includeGraphEntities(tsFile, graph)) {
    for (const method of [...entity.instanceMethods, ...entity.classMethods]) {
      if (method.name === tsName) raw.push(...(method.calls ?? []));
    }
    const file = entity.file ?? "";
    if (file === "" || seenFileFunctionFiles.has(file)) continue;
    seenFileFunctionFiles.add(file);
    for (const fn of graph.fileFunctions[file] ?? []) {
      if (fn.name === tsName) raw.push(...(fn.calls ?? []));
    }
  }
  return partitionNegatedCalls(raw);
}
