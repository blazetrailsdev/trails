/**
 * Shared AliasTracker plumbing for cross-klass merged joins.
 *
 * Rails shares one `alias_tracker` across every join dependency in
 * `build_joins`, so a `merge` that brings an association join onto a table the
 * outer relation already joins is aliased (`authors_categorizations`). trails
 * builds each cross-klass merged dependency with its own tracker at merge time,
 * so the duplicate join is never detected as a collision. These helpers build
 * one tracker spanning the same-relation join buckets and re-align the merged
 * dependencies against it, keeping the live SelectManager path
 * (`_applyJoinsToManager`) and the `from`-subquery path (`buildJoins`)
 * consistent.
 */
import { Nodes } from "@blazetrails/arel";
import { underscore, pluralize } from "@blazetrails/activesupport";
import { AliasTracker } from "../associations/alias-tracker.js";
import type { JoinDependency } from "../associations/join-dependency.js";
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
 * Build the AliasTracker shared between a relation's same-klass join buckets and
 * its cross-klass merged dependencies. Seeded from the raw `_joinValues` (so
 * `initialCountFor` counts manual joins) and the resolved `_joinClauses` tables;
 * the JoinDependency-emitted buckets claim their tables via
 * `seedTrackerFromJdNodes` once they are built.
 */
export function buildMergedJoinAliasTracker(host: MergedJoinAliasHost): AliasTracker {
  const connection = host._modelClass.connection;
  const aliasLength = connection.tableAliasLength();
  const manualJoins = host._joinValues.map((v) =>
    typeof v === "string" ? new Nodes.StringJoin(new Nodes.SqlLiteral(v.trim())) : v,
  );
  const tracker = new AliasTracker(aliasLength, undefined, manualJoins, connection);
  const ownerTable = host._modelClass.tableName;
  for (const c of host._joinClauses) {
    // Mirror the collision branch of aliased_table_for: first use keeps the real
    // name and claims it, repeats alias to `{plural_name}_{owner_table}`.
    tracker.aliasNameForTable(
      c.table,
      () => `${pluralize(underscore(c.assoc ?? ""))}_${ownerTable}`,
    );
  }
  return tracker;
}

/**
 * Claim every join `jd` emits into `tracker`, mirroring `aliased_table_for`: the
 * real table never rises above count 1 (first use keeps its name), while a
 * collision under an alias name is counted so the next `_N` is correct.
 */
export function seedTrackerFromJdNodes(tracker: AliasTracker, jd: JoinDependency): void {
  for (const node of jd.nodes) {
    const table = node.tableName;
    if ((tracker.aliases.get(table) ?? 0) === 0) tracker.aliases.set(table, 1);
    const eff = node.effectiveSqlName;
    if (eff && eff !== table) tracker.aliases.set(eff, (tracker.aliases.get(eff) ?? 0) + 1);
  }
}
