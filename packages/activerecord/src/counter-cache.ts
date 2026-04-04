import type { Base } from "./base.js";
import { quoteIdentifier } from "./connection-adapters/abstract/quoting.js";

/**
 * Counter cache operations for ActiveRecord models.
 *
 * Mirrors: ActiveRecord::CounterCache
 */

/**
 * Increment counter columns for a record by primary key.
 *
 * Mirrors: ActiveRecord::CounterCache::ClassMethods#increment_counter
 */
export async function incrementCounter(
  modelClass: typeof Base,
  attribute: string,
  id: unknown,
  by: number = 1,
  options?: { touch?: boolean | string | string[] },
): Promise<number> {
  const table = modelClass.arelTable;
  const touchClause = buildTouchClause(options?.touch);
  const quotedAttr = quoteIdentifier(attribute);
  const idBinds = Array.isArray(id) ? id : [id];
  const binds: unknown[] = [by, ...idBinds];
  const sql = `UPDATE ${quoteIdentifier(table.name)} SET ${quotedAttr} = COALESCE(${quotedAttr}, 0) + ?${touchClause} WHERE ${buildPkPlaceholder(modelClass)}`;
  return modelClass.adapter.executeMutation(sql, binds);
}

/**
 * Decrement counter columns for a record by primary key.
 *
 * Mirrors: ActiveRecord::CounterCache::ClassMethods#decrement_counter
 */
export async function decrementCounter(
  modelClass: typeof Base,
  attribute: string,
  id: unknown,
  by: number = 1,
  options?: { touch?: boolean | string | string[] },
): Promise<number> {
  return incrementCounter(modelClass, attribute, id, -by, options);
}

/**
 * Update counter columns for one or more records.
 *
 * Mirrors: ActiveRecord::CounterCache::ClassMethods#update_counters
 */
export async function updateCounters(
  modelClass: typeof Base,
  id: unknown | unknown[],
  counters: Record<string, number>,
  options?: { touch?: boolean | string | string[] },
): Promise<number> {
  const table = modelClass.arelTable;
  const touchClause = buildTouchClause(options?.touch);
  const binds: unknown[] = [];
  const setClause =
    Object.entries(counters)
      .map(([attr, amount]) => {
        const q = quoteIdentifier(attr);
        binds.push(amount);
        return `${q} = COALESCE(${q}, 0) + ?`;
      })
      .join(", ") + touchClause;
  const tableName = quoteIdentifier(table.name);

  const ids = Array.isArray(id) ? id : [id];
  if (Array.isArray(modelClass.primaryKey)) {
    const tuples = Array.isArray(ids[0]) ? (ids as unknown[][]) : [ids as unknown[]];
    const whereParts = tuples.map((t) => {
      const pk = modelClass.primaryKey as string[];
      return `(${pk
        .map((col) => {
          binds.push(t[pk.indexOf(col)]);
          return `${quoteIdentifier(col)} = ?`;
        })
        .join(" AND ")})`;
    });
    const sql = `UPDATE ${tableName} SET ${setClause} WHERE ${whereParts.join(" OR ")}`;
    return modelClass.adapter.executeMutation(sql, binds);
  }

  const placeholders = ids
    .map(() => {
      return "?";
    })
    .join(", ");
  binds.push(...ids);
  const sql = `UPDATE ${tableName} SET ${setClause} WHERE ${quoteIdentifier(modelClass.primaryKey as string)} IN (${placeholders})`;
  return modelClass.adapter.executeMutation(sql, binds);
}

/**
 * Reset counter caches by recounting the actual associated records.
 *
 * Mirrors: ActiveRecord::CounterCache::ClassMethods#reset_counters
 */
export async function resetCounters(
  modelClass: typeof Base,
  id: unknown,
  ...counterNames: string[]
): Promise<void> {
  const record = await modelClass.find(id);
  const assocDefs = (modelClass as any)._associations as
    | Array<{ type: string; name: string; options: any }>
    | undefined;
  const hasManyAssocs = assocDefs?.filter((a) => a.type === "hasMany") ?? [];
  const { resolveCounterColumn, countHasMany } = await import("./associations.js");
  for (const counterName of counterNames) {
    let assoc = hasManyAssocs.find((a) => a.name === counterName);
    let counterColumn: string;

    if (assoc) {
      counterColumn = resolveCounterColumn(modelClass, assoc, counterName);
    } else {
      if (counterName.endsWith("_count")) {
        assoc = hasManyAssocs.find((a) => a.name === counterName.slice(0, -6));
      }
      if (!assoc) {
        for (const candidate of hasManyAssocs) {
          const col = resolveCounterColumn(modelClass, candidate, candidate.name);
          if (col === counterName) {
            assoc = candidate;
            break;
          }
        }
      }
      if (!assoc) {
        throw new Error(
          `'${counterName}' is not a valid counter name or hasMany association on ${modelClass.name}`,
        );
      }
      counterColumn = resolveCounterColumn(modelClass, assoc, assoc.name);
    }

    const count = await countHasMany(record, assoc.name, assoc.options);
    await record.updateColumn(counterColumn, count);
  }
}

function buildPkPlaceholder(modelClass: typeof Base): string {
  const pk = modelClass.primaryKey;
  if (Array.isArray(pk)) {
    return pk.map((col) => `${quoteIdentifier(col)} = ?`).join(" AND ");
  }
  return `${quoteIdentifier(pk)} = ?`;
}

function buildTouchClause(touch?: boolean | string | string[]): string {
  if (!touch) return "";
  if (touch === true) return `, ${quoteIdentifier("updated_at")} = CURRENT_TIMESTAMP`;
  const cols = Array.isArray(touch) ? touch : [touch];
  if (cols.length === 0) return "";
  return cols.map((c) => `, ${quoteIdentifier(c)} = CURRENT_TIMESTAMP`).join("");
}

/**
 * Mirrors: ActiveRecord::CounterCache::ClassMethods#counter_cache_column?
 */
/**
 * Rails: _counter_cache_columns.include?(name)
 * Checks associations for belongs_to with counter_cache.
 */
export function isCounterCacheColumn(modelClass: typeof Base, columnName: string): boolean {
  const counterCols = getCounterCacheColumns(modelClass);
  return counterCols.has(columnName);
}

/**
 * Rails: populates _counter_cache_columns from belongs_to reflections
 * that have counter_cache enabled.
 */
export function loadSchemaBang(modelClass: typeof Base): void {
  // Force population of counter cache columns set
  getCounterCacheColumns(modelClass);
}

function getCounterCacheColumns(modelClass: typeof Base): Set<string> {
  const cached = (modelClass as any)._counterCacheColumns;
  if (cached) return cached;
  const cols = new Set<string>();
  const associations: any[] = (modelClass as any)._associations ?? [];
  for (const assoc of associations) {
    if (assoc.type === "belongsTo" && assoc.options?.counterCache) {
      const col =
        typeof assoc.options.counterCache === "string"
          ? assoc.options.counterCache
          : `${assoc.name}_count`;
      cols.add(col);
    }
  }
  (modelClass as any)._counterCacheColumns = cols;
  return cols;
}
