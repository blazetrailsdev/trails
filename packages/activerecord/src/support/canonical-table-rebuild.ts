import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import {
  buildCanonicalRegistry,
  canonicalForeignKeyDependents,
  prepareSchema,
  runTable,
} from "./canonical-schema.js";

export interface FkSafeDropPlanHost {
  tables(): Promise<string[]>;
  foreignKeys(
    tableName: string,
  ): Promise<readonly { readonly toTable: string; readonly name: string }[]>;
  foreignKeysReferencing?(toTables: readonly string[]): Promise<readonly FkDropBlocker[]>;
}

export interface FkDropBlocker {
  readonly fromTable: string;
  readonly toTable: string;
  readonly name: string;
}

export interface FkSafeDropPlan {
  readonly order: string[];
  readonly blockers: readonly FkDropBlocker[];
}

export async function fkSafeDropPlan(
  ss: FkSafeDropPlanHost,
  names: readonly string[],
  { scanInbound = false }: { scanInbound?: boolean } = {},
): Promise<FkSafeDropPlan> {
  if (names.length === 0) return { order: [], blockers: [] };
  const inSet = new Set(names);
  const existing = new Set(await ss.tables());
  const edges = new Map<string, { toTable: string; name: string }[]>();
  let sawForeignKey = false;
  for (const name of names) {
    if (!existing.has(name)) continue;
    const fks = await ss.foreignKeys(name);
    if (fks.length > 0) sawForeignKey = true;
    const targets = fks.filter((fk) => fk.toTable !== name && inSet.has(fk.toTable));
    if (targets.length > 0) {
      edges.set(
        name,
        targets.map((fk) => ({ toTable: fk.toTable, name: fk.name })),
      );
    }
  }
  if (!sawForeignKey && !scanInbound) return { order: [...names], blockers: [] };

  const blockers: FkDropBlocker[] = [];
  if (ss.foreignKeysReferencing) {
    for (const fk of await ss.foreignKeysReferencing(names)) {
      if (inSet.has(fk.fromTable) || !existing.has(fk.fromTable)) continue;
      blockers.push(fk);
    }
  } else {
    for (const table of existing) {
      if (inSet.has(table)) continue;
      for (const fk of await ss.foreignKeys(table)) {
        if (inSet.has(fk.toTable)) {
          blockers.push({ fromTable: table, toTable: fk.toTable, name: fk.name });
        }
      }
    }
  }
  if (edges.size === 0) return { order: [...names], blockers };

  const ordered: string[] = [];
  const emitted = new Set<string>();
  const onPath = new Set<string>();
  const visit = (name: string): void => {
    if (emitted.has(name)) return;
    onPath.add(name);
    for (const edge of edges.get(name) ?? []) {
      if (onPath.has(edge.toTable)) {
        blockers.push({ fromTable: name, toTable: edge.toTable, name: edge.name });
        continue;
      }
      visit(edge.toTable);
    }
    onPath.delete(name);
    emitted.add(name);
    ordered.push(name);
  };
  for (const name of names) visit(name);
  return { order: ordered.reverse(), blockers };
}

export function bulkInboundFkHost(
  adapter: DatabaseAdapter,
  ss: FkSafeDropPlanHost,
): FkSafeDropPlanHost {
  const name = adapter.adapterName;
  if (name !== "postgres" && name !== "mysql2") return ss;
  const foreignKeysReferencing = async (
    toTables: readonly string[],
  ): Promise<readonly FkDropBlocker[]> => {
    if (toTables.length === 0) return [];
    const list = toTables.map((t) => adapter.quote(t)).join(", ");
    const sql =
      name === "postgres"
        ? `SELECT t1.relname AS from_table, t2.relname AS to_table, c.conname AS name
             FROM pg_constraint c
             JOIN pg_class t1 ON c.conrelid = t1.oid
             JOIN pg_class t2 ON c.confrelid = t2.oid
             WHERE c.contype = 'f'
               AND c.confrelid IN (${toTables.map((t) => `to_regclass(${adapter.quote(t)})`).join(", ")})
             ORDER BY c.conname`
        : `SELECT kcu.table_name AS from_table,
                  kcu.referenced_table_name AS to_table,
                  kcu.constraint_name AS name
             FROM information_schema.key_column_usage kcu
             WHERE kcu.referenced_column_name IS NOT NULL
               AND kcu.table_schema = DATABASE()
               AND kcu.referenced_table_schema = DATABASE()
               AND kcu.referenced_table_name IN (${list})
             ORDER BY kcu.constraint_name`;
    const rows = (await adapter.internalExecQuery(sql, "SCHEMA")).toArray();
    const seen = new Set<string>();
    const blockers: FkDropBlocker[] = [];
    for (const row of rows) {
      const blocker = {
        fromTable: String(row.from_table),
        toTable: String(row.to_table),
        name: String(row.name),
      };
      const key = `${blocker.fromTable}\0${blocker.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      blockers.push(blocker);
    }
    return blockers;
  };
  return {
    tables: () => ss.tables(),
    foreignKeys: (table) => ss.foreignKeys(table),
    foreignKeysReferencing,
  };
}

export async function rebuildCanonicalTables(
  adapter: DatabaseAdapter,
  names: readonly string[],
): Promise<void> {
  const registry = await buildCanonicalRegistry();
  const wanted = new Set(names);
  const known = new Set(registry.map((d) => d.name));
  const unknown = [...wanted].filter((n) => !known.has(n));
  if (unknown.length > 0) {
    // eslint-disable-next-line blazetrails/rails-error-parity
    throw new Error(`rebuildCanonicalTables: unknown canonical table(s): ${unknown.join(", ")}`);
  }
  const dependents = await canonicalForeignKeyDependents();
  const queue = [...wanted];
  for (const name of queue) {
    for (const child of dependents.get(name) ?? []) {
      if (wanted.has(child)) continue;
      wanted.add(child);
      queue.push(child);
    }
  }
  const defs = registry.filter((d) => wanted.has(d.name));
  if (defs.length === 0) return;
  const { ss, typeMap } = await prepareSchema(adapter);
  const plan = await fkSafeDropPlan(
    bulkInboundFkHost(adapter, ss),
    defs.map((d) => d.name),
    { scanInbound: true },
  );
  for (const blocker of plan.blockers) {
    await ss.removeForeignKey(blocker.fromTable, {
      name: blocker.name,
      toTable: blocker.toTable,
    });
  }
  for (const name of plan.order) {
    await ss.dropTable(name, { ifExists: true });
  }
  for (const def of defs) {
    await runTable(adapter, ss, typeMap, def);
  }
  await (adapter as { clearCacheBang?: () => void | Promise<void> }).clearCacheBang?.();
}

export async function ensureCanonicalTables(
  adapter: DatabaseAdapter,
  names: readonly string[],
): Promise<void> {
  const registry = await buildCanonicalRegistry();
  const wanted = new Set(names);
  const known = new Set(registry.map((d) => d.name));
  const unknown = [...wanted].filter((n) => !known.has(n));
  if (unknown.length > 0) {
    // eslint-disable-next-line blazetrails/rails-error-parity
    throw new Error(`ensureCanonicalTables: unknown canonical table(s): ${unknown.join(", ")}`);
  }
  const defs = registry.filter((d) => wanted.has(d.name));
  if (defs.length === 0) return;
  const { ss, typeMap } = await prepareSchema(adapter);
  let created = false;
  for (const def of defs) {
    if (await ss.tableExists(def.name)) continue;
    await runTable(adapter, ss, typeMap, def);
    created = true;
  }
  if (created)
    await (adapter as { clearCacheBang?: () => void | Promise<void> }).clearCacheBang?.();
}
