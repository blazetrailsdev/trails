import type { AbstractAdapter as DatabaseAdapter } from "../../lib/connection-adapters/abstract-adapter.js";
import { buildCanonicalRegistry, prepareSchema, runTable } from "./canonical-schema.js";

export async function ensureCanonicalTables(
  adapter: DatabaseAdapter,
  names: readonly string[],
): Promise<void> {
  const registry = await buildCanonicalRegistry();
  const wanted = new Set(names);
  const known = new Set(registry.map((d) => d.name));
  const unknown = [...wanted].filter((n) => !known.has(n));
  if (unknown.length > 0) {
    throw new Error(`ensureCanonicalTables: unknown canonical table(s): ${unknown.join(", ")}`);
  }
  const defs = registry.filter((d) => wanted.has(d.name));
  if (defs.length === 0) return;
  const { ss, typeMap } = await prepareSchema(adapter);
  const created = [];
  for (const def of defs) {
    if (await ss.tableExists(def.name)) continue;
    await runTable(adapter, ss, typeMap, def);
    created.push(def);
  }
  const createdNames = new Set(created.map((d) => d.name));
  for (const def of registry) {
    if (!def.foreignKeys) continue;
    const fromCreated = createdNames.has(def.name);
    const fks = def.foreignKeys.filter((fk) => fromCreated || createdNames.has(fk.toTable));
    if (fks.length === 0) continue;
    if (!fromCreated && !(await ss.tableExists(def.name))) continue;
    for (const { toTable, opts } of fks) {
      if (!createdNames.has(toTable) && !(await ss.tableExists(toTable))) continue;
      await ss.addForeignKey(def.name, toTable, opts);
    }
  }
  if (created.length > 0)
    await (adapter as { clearCacheBang?: () => void | Promise<void> }).clearCacheBang?.();
}
