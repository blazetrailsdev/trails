import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
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
