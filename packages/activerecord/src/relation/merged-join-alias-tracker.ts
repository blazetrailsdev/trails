/**
 * Shared AliasTracker construction for cross-klass merged joins.
 *
 * Rails shares one `alias_tracker` across every join dependency in
 * `build_joins`, so a `merge` that brings an association join onto a table the
 * outer relation already joins is aliased (`authors_categorizations`). This
 * builds that single tracker — seeded with the base table (Rails
 * `AliasTracker.create(connection, table_name, joins)`), the manual joins, and
 * the resolved `_joinClauses` tables — and threads it through every
 * `JoinDependency#joinConstraints` in the live SelectManager path
 * (`_applyJoinsToManager`) and the `from`-subquery path (`buildJoins`). Each
 * dependency then claims and aliases its tables lazily at emit-time in
 * `makeConstraints`, so a duplicate join collides naturally — no separate
 * seed/re-align pass.
 */
import { Nodes } from "@blazetrails/arel";
import { underscore, pluralize } from "@blazetrails/activesupport";
import { AliasTracker } from "../associations/alias-tracker.js";
import type { Quoting } from "../connection-adapters/abstract/quoting-interface.js";

interface MergedJoinAliasHost {
  _modelClass: {
    tableName: string;
    connection: Quoting & { tableAliasLength(): number };
  };
  _joinValues: (string | Nodes.Join)[];
  _joinClauses: Array<{ table: string; assoc?: string }>;
}

/**
 * Build the AliasTracker shared across a relation's join dependencies. Seeded
 * with the base table (Rails `AliasTracker.create(connection, table_name,
 * joins)`), the raw `_joinValues` (so `initialCountFor` counts manual joins),
 * and the resolved `_joinClauses` tables. Each JoinDependency then claims and
 * aliases its own tables at emit-time in `makeConstraints`.
 */
export function buildMergedJoinAliasTracker(host: MergedJoinAliasHost): AliasTracker {
  const connection = host._modelClass.connection;
  const aliasLength = connection.tableAliasLength();
  const manualJoins = host._joinValues.map((v) =>
    typeof v === "string" ? new Nodes.StringJoin(new Nodes.SqlLiteral(v.trim())) : v,
  );
  const tracker = new AliasTracker(aliasLength, undefined, manualJoins, connection);
  const ownerTable = host._modelClass.tableName;
  // Seed the base table (Rails AliasTracker.create sets aliases[initial_table] = 1)
  // so an association that joins back onto the relation's own table collides.
  tracker.aliases.set(ownerTable, 1);
  for (const c of host._joinClauses) {
    if (c.assoc) {
      // Association where-join (whereAssociated / associated): mirror the
      // collision branch of aliased_table_for — first use keeps the real name
      // and claims it, repeats alias to `{plural_name}_{owner_table}`.
      tracker.aliasNameForTable(c.table, () => `${pluralize(underscore(c.assoc!))}_${ownerTable}`);
    } else if ((tracker.aliases.get(c.table) ?? 0) === 0) {
      // Raw two-arg `joins(table, on)` clause (no reflection): Rails emits these
      // verbatim and only seeds their table into the alias_tracker so a later
      // association/merged join onto the same table collides — the raw join
      // itself is never aliased. Claim the table without an alias candidate
      // (the assoc-less candidate would be the malformed `_owner_table`).
      tracker.aliases.set(c.table, 1);
    }
  }
  return tracker;
}
