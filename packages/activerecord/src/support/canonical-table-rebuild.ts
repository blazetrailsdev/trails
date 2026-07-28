/**
 * Per-worker canonical-table drop/rebuild machinery.
 *
 * The half of the old `canonical-schema.ts` with **no Rails counterpart**:
 * Rails' suite is one process against one database, so it never drops and
 * relays a subset of `schema.rb`. trails' vitest forks share a per-worker
 * database, so a file that reduces a canonical table's shape has to restore it
 * — that is what {@link rebuildCanonicalTables} and {@link ensureCanonicalTables}
 * are for, and the FK-aware drop planning ({@link fkSafeDropPlan},
 * {@link bulkInboundFkHost}) is what makes the drop possible on PG/MySQL.
 *
 * The schema.rb transcription itself lives next door in `canonical-schema.ts`;
 * this module consumes its registry rather than restating any table.
 *
 * Hard rules: no `node:*` imports, no `process.*`, async fs only.
 */

import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import type { TableDefinition } from "../connection-adapters/abstract/schema-definitions.js";
import {
  buildCanonicalRegistry,
  prepareSchema,
  runTable,
  TableBuilder,
} from "./canonical-schema.js";
import { COLUMN_TYPE_MAP_SQLITE } from "./schema-types.js";

/** Minimal slice of the schema-statement surface {@link fkSafeDropPlan} needs. */
export interface FkSafeDropPlanHost {
  tables(): Promise<string[]>;
  foreignKeys(
    tableName: string,
  ): Promise<readonly { readonly toTable: string; readonly name: string }[]>;
  /**
   * Optional bulk reverse lookup: every foreign key in the database that points
   * at one of `toTables`, in one round trip. Adapters that don't provide it fall
   * back to the per-table `foreignKeys` loop, which is what this stands in for.
   *
   * No Rails counterpart — `SchemaStatements#foreign_keys` is per-table there
   * too and Rails has no reverse form. It is supplied by
   * {@link bulkInboundFkHost} rather than by an adapter, so the invention stays
   * inside the test helper that needs it and no production adapter grows a
   * surface Rails lacks.
   */
  foreignKeysReferencing?(toTables: readonly string[]): Promise<readonly FkDropBlocker[]>;
}

/**
 * A foreign key that has to be dropped before the plan's order can run: either
 * it points into the drop set from a table outside it (no ordering among the
 * dropped tables can help — PG/MySQL refuse the `DROP TABLE` outright), or it
 * closes a cycle among the dropped tables (which has no safe order at all).
 */
export interface FkDropBlocker {
  readonly fromTable: string;
  readonly toTable: string;
  readonly name: string;
}

/** Drop order plus the constraints that must be removed first. */
export interface FkSafeDropPlan {
  readonly order: string[];
  readonly blockers: readonly FkDropBlocker[];
}

/**
 * Plan the drop of `names`: order them so every table is dropped before any
 * table it references (referencing tables first), and list the foreign keys
 * that no ordering can work around and so must be removed first.
 *
 * Registry order cannot stand in for the ordering: it is roughly alphabetical,
 * not topological — `lessons_students` is registered before `students`, so
 * merely reversing it drops the target before its referencer. The canonical
 * registry declares no foreign keys of its own, but a test may add one (e.g.
 * `addForeignKey("lessons_students", "students")` in the abstract-mysql-adapter
 * schema tests), so the plan is derived from the FKs the database actually
 * holds rather than from anything declared here.
 *
 * Two shapes have no safe order and surface as `blockers` instead:
 *
 * - an FK from a table *outside* `names` into one inside it — PG and MySQL
 *   refuse to drop a referenced table however the drops are sequenced;
 * - a cycle among the dropped tables — the back edge is reported and the
 *   remaining (acyclic) edges still shape the order.
 *
 * Suspending referential integrity is not an alternative for the inbound case:
 * `disableReferentialIntegrity` covers MySQL/SQLite, but PG's `DISABLE TRIGGER
 * ALL` still refuses to let a referenced table be dropped, so the constraint
 * has to go regardless.
 *
 * FKs are read only for tables that currently exist, and by default only for
 * the tables being dropped: finding inbound FKs means introspecting every
 * *other* live table (hundreds, for the canonical schema), so that scan runs
 * only when `scanInbound` is passed or the drop set reported a foreign key —
 * *any* foreign key, counted before self-loops and out-of-set targets are
 * filtered out, because the signal wanted there is the weak "this database uses
 * foreign keys at all", not "these tables constrain each other". On an FK-free
 * database this costs exactly what it did before.
 *
 * That default is a cheap heuristic, not a guarantee: a drop set whose tables
 * hold no FK of their own but are pointed at from outside is precisely what it
 * misses. Any caller that has to be *right* about inbound FKs — as
 * {@link rebuildCanonicalTables} does — must pass `scanInbound` and pay for the
 * scan rather than rely on it.
 *
 * @internal
 */
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
      // A target still on the current path closes a cycle: no drop order can
      // satisfy this edge, so report the constraint and ignore the edge.
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
  // Referencers are emitted after their targets, so walk in input order and
  // reverse: the result drops referencers first.
  for (const name of names) visit(name);
  return { order: ordered.reverse(), blockers };
}

/**
 * Wrap `ss` so {@link fkSafeDropPlan}'s inbound scan reads every referencing
 * foreign key in one catalog query instead of one introspection per live table
 * not being dropped.
 *
 * This is an invention with no Rails counterpart: Rails' `foreign_keys` is
 * per-table and it has no reverse form, so nothing upstream can be ported here.
 * It is justified by cost, not taste — on a loaded canonical database (322
 * tables) the per-table loop measured ~790ms per `rebuildCanonicalTables` call
 * on PostgreSQL and ~530ms on MySQL, and the helper is called 21 times across
 * the suite. Keeping it here rather than on the adapters confines the invented
 * surface to the test helper that needs it; `fkSafeDropPlan` still takes the
 * plain per-table host and its unit tests exercise that path unchanged.
 *
 * SQLite is left on the loop: `PRAGMA foreign_key_list` has no reverse form and
 * the loop is already in the noise there (measured within run-to-run variance).
 *
 * @internal
 */
export function bulkInboundFkHost(
  adapter: DatabaseAdapter,
  ss: FkSafeDropPlanHost,
): FkSafeDropPlanHost {
  const name = adapter.adapterName;
  if (name !== "postgres" && name !== "mysql") return ss;
  const foreignKeysReferencing = async (
    toTables: readonly string[],
  ): Promise<readonly FkDropBlocker[]> => {
    if (toTables.length === 0) return [];
    const list = toTables.map((t) => adapter.quote(t)).join(", ");
    const sql =
      name === "postgres"
        ? // The referenced table is matched by OID via `to_regclass`, not by
          // name: `relname IN (...)` scoped to the search path would match a
          // same-named table in *any* schema on it and report a false-positive
          // blocker (a real `decoy.authors` did, when this filtered on
          // `nspname = ANY (current_schemas(false))`). `to_regclass` applies
          // exactly PostgreSQL's own name resolution — first match on the search
          // path, NULL when nothing resolves, which simply matches no row — so a
          // drop-set name resolves to the one relation the DDL will drop, the
          // same relation the per-table `foreignKeys` would have introspected.
          `SELECT t1.relname AS from_table, t2.relname AS to_table, c.conname AS name
             FROM pg_constraint c
             JOIN pg_class t1 ON c.conrelid = t1.oid
             JOIN pg_class t2 ON c.confrelid = t2.oid
             WHERE c.contype = 'f'
               AND c.confrelid IN (${toTables.map((t) => `to_regclass(${adapter.quote(t)})`).join(", ")})
             ORDER BY c.conname`
        : // `referenced_column_name IS NOT NULL` and the schema scoping mirror
          // the per-table `foreignKeys` (mysql/schema-statements.ts): the null
          // check keeps non-FK key usage out, and scoping *both* ends to
          // DATABASE() keeps a same-named table in another database from
          // reporting a false-positive blocker (MySQL has no search path, so
          // there is no resolution step beyond this).
          `SELECT kcu.table_name AS from_table,
                  kcu.referenced_table_name AS to_table,
                  kcu.constraint_name AS name
             FROM information_schema.key_column_usage kcu
             WHERE kcu.referenced_column_name IS NOT NULL
               AND kcu.table_schema = DATABASE()
               AND kcu.referenced_table_schema = DATABASE()
               AND kcu.referenced_table_name IN (${list})
             ORDER BY kcu.constraint_name`;
    const rows = await adapter.schemaQuery(sql);
    // `key_column_usage` reports a composite foreign key as one row per column
    // (the PG query joins no attribute rows, so it is already per-constraint);
    // the plan wants one blocker per constraint either way.
    const seen = new Set<string>();
    const blockers: FkDropBlocker[] = [];
    for (const row of rows) {
      const blocker = {
        fromTable: String(row.from_table),
        toTable: String(row.to_table),
        name: String(row.name),
      };
      const key = `${blocker.fromTable} ${blocker.name}`;
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

/**
 * Map of referenced table -> tables whose definition declares a foreign key into
 * it. Built by replaying each table's block against a probe TableDefinition that
 * records `foreignKey` calls and discards columns, so the edges come from the
 * one declaration site rather than a hand-maintained second list.
 */
let _dependents: Map<string, string[]> | null = null;

async function foreignKeyDependents(): Promise<Map<string, string[]>> {
  if (_dependents) return _dependents;
  const dependents = new Map<string, string[]>();
  for (const def of await buildCanonicalRegistry()) {
    const probe = {
      column: () => {},
      foreignKey: (toTable: string) => {
        const children = dependents.get(toTable) ?? [];
        children.push(def.name);
        dependents.set(toTable, children);
      },
    } as unknown as TableDefinition;
    def.fn(new TableBuilder(probe, "sqlite", COLUMN_TYPE_MAP_SQLITE, null, null));
  }
  _dependents = dependents;
  return dependents;
}

/**
 * Drop and recreate a named subset of canonical tables, restoring each to its
 * full canonical shape — the `create_table`-based equivalent of
 * `defineSchema({ …subset }, { dropExisting: true })`. Test files use it as an
 * anti-contamination shield against a sibling file that left a canonical table
 * in a reduced shape on the shared per-worker DB. Throws on an unknown name — a
 * silent skip would quietly disable the shield and let the flake back in.
 */
export async function rebuildCanonicalTables(
  adapter: DatabaseAdapter,
  names: readonly string[],
): Promise<void> {
  const registry = await buildCanonicalRegistry();
  const wanted = new Set(names);
  const known = new Set(registry.map((d) => d.name));
  const unknown = [...wanted].filter((n) => !known.has(n));
  if (unknown.length > 0) {
    // Test-helper invariant with no Rails error counterpart — a bare Error is
    // intentional (mirrors the sibling ensureCanonicalTables throw below).
    // eslint-disable-next-line blazetrails/rails-error-parity
    throw new Error(`rebuildCanonicalTables: unknown canonical table(s): ${unknown.join(", ")}`);
  }
  // A table nobody asked for still has to be rebuilt when it holds a foreign key
  // into one that was: MySQL refuses to drop a table a live FK points at, and PG
  // would cascade the constraint away silently.
  const dependents = await foreignKeyDependents();
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
  // `scanInbound` is not optional here: this helper exists as the shield against
  // a sibling test that left a stray foreign key pointing at a canonical table,
  // which is exactly the shape fkSafeDropPlan's default heuristic cannot see —
  // the dropped table holds no FK of its own, so nothing would trigger the scan.
  // The scan costs one FK introspection per live table not being rebuilt, which
  // is why the host is wrapped: on PG/MySQL bulkInboundFkHost collapses that
  // into a single catalog query (see its note on the deviation).
  const plan = await fkSafeDropPlan(
    bulkInboundFkHost(adapter, ss),
    defs.map((d) => d.name),
    { scanInbound: true },
  );
  // An FK reaching in from a table nobody asked for (or one closing a cycle)
  // has no drop order that works; drop the constraint itself first. The
  // referencing table keeps its shape — only the constraint is lost, and a
  // canonical table's own FKs come back with the recreate below.
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
  (adapter as { clearCacheBang?: () => void }).clearCacheBang?.();
}

/**
 * Idempotently lay a named subset of canonical tables, creating each in its full
 * canonical shape only when it is not already present — the no-drop counterpart
 * to {@link rebuildCanonicalTables}. Use it against a shared, already-schema-
 * loaded connection (e.g. `Base.connection`) where dropping an existing table
 * would clobber data other suites rely on: existing tables are left untouched
 * and only genuinely-missing ones are created. Throws on an unknown name for the
 * same reason {@link rebuildCanonicalTables} does.
 *
 * @internal Low-level plumbing for shared internal setup helpers (e.g.
 * `encryption/test-helpers.ts`). Do NOT call this from a `*.test.ts` file — wire
 * the canonical schema + fixtures through the `fixtures({ ... })` helper, which
 * is the sanctioned public test surface. The
 * `blazetrails/no-internal-canonical-loaders` ESLint rule enforces this.
 */
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
  if (created) (adapter as { clearCacheBang?: () => void }).clearCacheBang?.();
}
