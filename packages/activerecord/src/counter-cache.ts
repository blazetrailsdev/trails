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
  this: typeof Base,
  attribute: string,
  id: unknown,
  by: number = 1,
  options?: { touch?: boolean | string | string[] },
): Promise<number> {
  const table = this.arelTable;
  const touchClause = buildTouchClause(options?.touch);
  const quotedAttr = quoteIdentifier(attribute);
  const idBinds = Array.isArray(id) ? id : [id];
  const binds: unknown[] = [by, ...idBinds];
  const sql = `UPDATE ${quoteIdentifier(table.name)} SET ${quotedAttr} = COALESCE(${quotedAttr}, 0) + ?${touchClause} WHERE ${buildPkPlaceholder(this)}`;
  return this.adapter.executeMutation(sql, binds);
}

/**
 * Decrement counter columns for a record by primary key.
 *
 * Mirrors: ActiveRecord::CounterCache::ClassMethods#decrement_counter
 */
export async function decrementCounter(
  this: typeof Base,
  attribute: string,
  id: unknown,
  by: number = 1,
  options?: { touch?: boolean | string | string[] },
): Promise<number> {
  return incrementCounter.call(this, attribute, id, -by, options);
}

/**
 * Update counter columns for one or more records.
 *
 * Mirrors: ActiveRecord::CounterCache::ClassMethods#update_counters
 */
export async function updateCounters(
  this: typeof Base,
  id: unknown | unknown[],
  counters: Record<string, number>,
  options?: { touch?: boolean | string | string[] },
): Promise<number> {
  const table = this.arelTable;
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
  if (Array.isArray(this.primaryKey)) {
    const tuples = Array.isArray(ids[0]) ? (ids as unknown[][]) : [ids as unknown[]];
    const whereParts = tuples.map((t) => {
      const pk = this.primaryKey as string[];
      return `(${pk
        .map((col) => {
          binds.push(t[pk.indexOf(col)]);
          return `${quoteIdentifier(col)} = ?`;
        })
        .join(" AND ")})`;
    });
    const sql = `UPDATE ${tableName} SET ${setClause} WHERE ${whereParts.join(" OR ")}`;
    return this.adapter.executeMutation(sql, binds);
  }

  const placeholders = ids
    .map(() => {
      return "?";
    })
    .join(", ");
  binds.push(...ids);
  const sql = `UPDATE ${tableName} SET ${setClause} WHERE ${quoteIdentifier(this.primaryKey as string)} IN (${placeholders})`;
  return this.adapter.executeMutation(sql, binds);
}

/**
 * Reset counter caches by recounting the actual associated records.
 *
 * Mirrors: ActiveRecord::CounterCache::ClassMethods#reset_counters
 */
export async function resetCounters(
  this: typeof Base,
  id: unknown,
  ...counterNames: string[]
): Promise<void> {
  const record = await this.find(id);
  const assocDefs = (this as any)._associations as
    | Array<{ type: string; name: string; options: any }>
    | undefined;
  const hasManyAssocs = assocDefs?.filter((a) => a.type === "hasMany") ?? [];
  const { resolveCounterColumn, countHasMany } = await import("./associations.js");
  for (const counterName of counterNames) {
    let assoc = hasManyAssocs.find((a) => a.name === counterName);
    let counterColumn: string;

    if (assoc) {
      counterColumn = resolveCounterColumn(this, assoc, counterName);
    } else {
      if (counterName.endsWith("_count")) {
        assoc = hasManyAssocs.find((a) => a.name === counterName.slice(0, -6));
      }
      if (!assoc) {
        for (const candidate of hasManyAssocs) {
          const col = resolveCounterColumn(this, candidate, candidate.name);
          if (col === counterName) {
            assoc = candidate;
            break;
          }
        }
      }
      if (!assoc) {
        throw new Error(
          `'${counterName}' is not a valid counter name or hasMany association on ${this.name}`,
        );
      }
      counterColumn = resolveCounterColumn(this, assoc, assoc.name);
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
 * Check whether a column is a counter-cache column — i.e. any belongs_to
 * association on this class was declared with `counter_cache:` that
 * resolves to this column name.
 *
 * Mirrors: ActiveRecord::CounterCache::ClassMethods#counter_cache_column?
 * (The `Q` suffix mirrors Ruby's `?` predicate convention.)
 */
export function counterCacheColumnQ(this: typeof Base, columnName: string): boolean {
  const counterCols = getCounterCacheColumns(this);
  return counterCols.has(columnName);
}

/**
 * Eagerly populate the cached set of counter-cache columns from
 * `belongs_to` reflections that have `counter_cache` enabled.
 *
 * Mirrors the column-set bookkeeping that Rails'
 * `ActiveRecord::CounterCache#load_schema!` performs (a private extension
 * point inside `ClassMethods`). Not currently part of `ClassMethods`
 * because, like in Rails, it's an internal hook into the schema loader
 * rather than a user-facing class method — `counterCacheColumnQ` lazily
 * primes the same cache via `getCounterCacheColumns` on first read.
 */
export function loadSchemaBang(this: typeof Base): void {
  getCounterCacheColumns(this);
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

/**
 * Module methods wired onto Base as static methods via `extend()` in base.ts.
 * Mirrors Rails' `ActiveSupport::Concern#ClassMethods` convention.
 */
export const ClassMethods = {
  incrementCounter,
  decrementCounter,
  updateCounters,
  resetCounters,
  counterCacheColumnQ,
};
