/**
 * Trails-specific alias seeding for the shared `build_joins` AliasTracker.
 *
 * Rails shares one `alias_tracker(leading_joins + join_nodes, aliases)`
 * (query_methods.rb:1894) across every join dependency in `build_joins`, so a
 * `merge` that brings an association join onto a table the outer relation
 * already joins is aliased (`authors_categorizations`). Trails builds that
 * tracker through the converged `Relation#aliasTracker` at each `build_joins`
 * call site (`buildJoins` / `_applyJoinsToManager`) and then seeds it here
 * with the resolved `_joinClauses` tables — a trails-only step: Rails has no
 * `_joinClauses` (its raw join clauses ride `joins_values` as Arel nodes and
 * are counted by `initial_count_for`), so their pre-resolved tables must be
 * claimed explicitly for a later association/merged join to collide. Each
 * dependency then claims and aliases its tables lazily at emit-time in
 * `makeConstraints`, so a duplicate join collides naturally — no separate
 * seed/re-align pass.
 */
import { underscore, pluralize } from "@blazetrails/activesupport";
import type { AliasTracker } from "../associations/alias-tracker.js";

interface MergedJoinAliasHost {
  _modelClass: {
    tableName: string;
  };
  _joinClauses: Array<{ table: string; assoc?: string }>;
}

/**
 * Claim the host's resolved `_joinClauses` tables into `tracker` so a later
 * association/merged join onto the same table is detected as a collision.
 */
export function seedJoinClauseAliases(host: MergedJoinAliasHost, tracker: AliasTracker): void {
  const ownerTable = host._modelClass.tableName;
  for (const c of host._joinClauses) {
    if (c.assoc) {
      // Association where-join (whereAssociated / associated): mirror the
      // collision branch of aliased_table_for — first use keeps the real name
      // and claims it, repeats alias to `{plural_name}_{owner_table}`.
      tracker.aliasNameForTable(c.table, () => `${pluralize(underscore(c.assoc!))}_${ownerTable}`);
    } else if ((tracker.aliases.get(c.table) ?? 0) === 0) {
      // Raw explicit-ON join clause with no reflection (e.g. the
      // `leftJoins(table, on)` form): Rails emits these verbatim and only seeds
      // their table into the alias_tracker so a later association/merged join
      // onto the same table collides — the raw join itself is never aliased.
      // Claim the table without an alias candidate (the assoc-less candidate
      // would be the malformed `_owner_table`).
      tracker.aliases.set(c.table, 1);
    }
  }
}
