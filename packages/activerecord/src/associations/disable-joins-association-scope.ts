import { any } from "@blazetrails/activesupport";
import { Nodes } from "@blazetrails/arel";
import type { AliasTracker } from "./alias-tracker.js";
import {
  AssociationScope,
  ReflectionProxy,
  type AssociationScopeable,
  type ValueTransformation,
  unionOrderClauses,
} from "./association-scope.js";
import { DisableJoinsAssociationRelation } from "../disable-joins-association-relation.js";
import { disableJoinsAssociationRelationClassFor } from "../relation/delegation.js";
import type { Relation } from "../relation.js";
import { WhereClause } from "../relation/where-clause.js";
import type { ExceptKey } from "../relation/query-methods.js";
import type { Base } from "../base.js";
import type { AbstractReflection } from "../reflection.js";
import { argumentError } from "../relation/query-methods.js";
import { setDjasScopeBuilder } from "./_scope-slots.js";

type ChainEntry = AbstractReflection | ReflectionProxy;

/**
 * Join-id accumulator shape across the chain walk. Single-column keys
 * carry a flat list of scalars (`unknown[]`); composite keys carry a
 * list of tuples (`unknown[][]`). The shape per iteration is decided
 * by the step's key arity in `_addConstraintsDj` / `lastScopeChain`.
 */
type JoinIds = unknown[] | unknown[][];

/**
 * Normalize a `joinPrimaryKey` / `joinForeignKey` to an array of column
 * names. Single-column (`"id"`) and composite (`["a", "b"]`) shapes
 * are both supported; the per-step WHERE goes through `where({key:
 * ids})` for single-column or `where(cols, tuples)` for composite —
 * both paths land in `PredicateBuilder` (the latter via
 * `buildComposite`).
 */
function keyColumns(key: string | string[], label: string): string[] {
  if (Array.isArray(key)) {
    if (key.length === 0) {
      throw new Error(`DisableJoinsAssociationScope: empty ${label}`);
    }
    return key;
  }
  return [key];
}

/**
 * Read multiple owner attributes as a tuple. Single-column case
 * returns `[v]`; composite returns `[v1, v2, ...]` matching the
 * column order. Used to seed the chain-walk's first join-IDs entry.
 */
function readTuple(owner: Base, cols: string[]): unknown[] {
  return cols.map((c) => owner._readAttribute(c));
}

/**
 * Resolve a reflection's `joinPrimaryKey` using the runtime-klass
 * form when the reflection exposes it. `BelongsToReflection#joinPrimaryKey`
 * hard-codes `"id"` for polymorphic sources since the target class
 * isn't known at definition time, but the resolved sourceType class
 * may use a custom PK (`uuid`, a composite, ...). Routing through
 * `joinPrimaryKey(klass)` mirrors the AssociationScope walk
 * (association-scope.ts:nextChainScope) and Rails'
 * `join_primary_key(klass)` (reflection.rb:606, :944, :1093).
 */
function resolveJoinPrimaryKey(reflection: unknown, klass?: typeof Base): string | string[] {
  const r = reflection as { joinPrimaryKey(klass?: typeof Base): string | string[] };
  return r.joinPrimaryKey(klass);
}

/**
 * Builds scopes for `:through` associations that disable joins, querying
 * each step's table separately and stitching results in memory via IN(...)
 * rather than emitting a multi-table JOIN. Used when the source and
 * through models live in separate databases (Rails' `disable_joins: true`).
 *
 * Chain walk (Rails: `disable_joins_association_scope.rb#last_scope_chain`):
 * the chain is reversed; each non-tail step has its constraints applied,
 * then `pluck(next_step.join_foreign_key)` collects IDs that feed the
 * next step's `WHERE join_primary_key IN (...)`. The final step's relation
 * is returned to the caller (or wrapped in a `DisableJoinsAssociationRelation`
 * when the source has no order but an upstream step was ordered).
 *
 * Intermediate `pluck` calls are async in this codebase (Rails' are
 * sync DB calls), so the chain walk itself cannot be synchronous.
 * `scope()` returns a `DisableJoinsAssociationRelation` in deferred-
 * chain mode — a sync `Relation` whose `toArray()` runs the async
 * walk on first load. This matches Rails' `Relation`-returning
 * signature without forcing callers into a `Promise<{ relation }>`
 * boxing dance.
 *
 * Mirrors: ActiveRecord::Associations::DisableJoinsAssociationScope
 */
export class DisableJoinsAssociationScope extends AssociationScope {
  constructor(valueTransformation: ValueTransformation = (v) => v) {
    super(valueTransformation);
  }

  /**
   * Sync override of `AssociationScope#scope`. Returns a deferred-
   * chain `DisableJoinsAssociationRelation` — the async chain walk
   * runs on first `toArray()`. Matches Rails' `Relation`-returning
   * signature (`DisableJoinsAssociationScope#scope` at
   * disable_joins_association_scope.rb:6-15) without the boxing
   * workaround our async pluck would otherwise force.
   *
   * @missingRailsCall add_constraints — PERMANENT: this body calls it at Rails'
   * call site (disable_joins_association_scope.rb:13), spelled
   * `_addConstraintsDj`. Rails' subclass shadows `AssociationScope#add_constraints`
   * with a different arity, which Ruby permits; TypeScript rejects a derived
   * declaration of a name the base declares `private` (TS2415) and the two
   * signatures are not override-compatible, so the `Dj` suffix is the only
   * spelling available. The landed `add-leading-underscore-call-candidate-to-conventions`
   * candidate (PR #6825) does not reach it: that candidate is `"_" + camel`, and
   * this name carries the `Dj` suffix on top of the underscore.
   */
  override scope(association: AssociationScopeable): unknown {
    const sourceReflection = association.reflection;
    const owner = association.owner;
    const klass = association.klass;
    // Boxed walker — see `DJAR.deferred` doc. The bare Relation must
    // never cross an `await` boundary, or Promise/A+ unwraps it via
    // the Relation thenable (`.then` → `toArray`). Build sync, box,
    // return the box.
    // Rails: `unscoped = association.klass.unscoped` then
    // `get_chain(source_reflection, association, unscoped.alias_tracker)`
    // (disable_joins_association_scope.rb:9-10) — the tracker comes from the
    // converged `Relation#aliasTracker` (relation.rb:1307-1309). DJAS never
    // emits joins, so the tracker only names repeat-visit `ReflectionProxy`
    // aliased tables during the chain walk.
    const unscoped = klass.unscoped() as { aliasTracker: () => AliasTracker };
    return DisableJoinsAssociationRelation.deferred(klass, async () => {
      const reverseChain = this.getChain(sourceReflection, association, unscoped.aliasTracker())
        .slice()
        .reverse();
      const [lastReflection, lastOrdered, lastJoinIds] = await this.lastScopeChain(
        reverseChain,
        owner,
      );
      // Prefer the runtime-klass form — `BelongsToReflection#joinPrimaryKey`
      // hard-codes `"id"` for polymorphic sources, but a sourceType
      // target may use a different PK (e.g. `uuid`). Mirrors the
      // AssociationScope chain walk which also routes through
      // joinPrimaryKey(klass) (reflection.rb:944).
      const keyCols = keyColumns(
        resolveJoinPrimaryKey(lastReflection, (lastReflection as { klass?: typeof Base }).klass),
        "joinPrimaryKey",
      );
      const relation = this._addConstraintsDj(
        lastReflection,
        keyCols,
        lastJoinIds,
        owner,
        lastOrdered,
      ) as Relation<Base>;
      // When an upstream step plucked no ids, the final step's
      // `where(key IN [])` is a contradictory (null) relation: loading it
      // short-circuits to `[]` with no SELECT (Relation#exec_main_query's
      // `where_clause.contradiction?` guard), matching the query count Rails
      // emits for an empty through chain. No DJAS-local `.none()` needed.
      return { relation };
    });
  }

  /**
   * Walk the reversed chain, accumulating `[reflection, ordered, joinIds]`.
   * The first item seeds with the owner's join_foreign_key value; each
   * subsequent step builds its scope, plucks the next step's
   * join_foreign_key, and forwards the resulting IDs.
   *
   * Mirrors: DisableJoinsAssociationScope#last_scope_chain (lines 18-31).
   *
   * @missingRailsCall add_constraints — PERMANENT: see `_addConstraintsDj` below: the
   * subclass cannot reuse Rails' name because the base class declares it
   * `private` with an incompatible signature. This body calls it at Rails'
   * call site (disable_joins_association_scope.rb:23).
   */
  private async lastScopeChain(
    reverseChain: ChainEntry[],
    owner: Base,
  ): Promise<[ChainEntry, boolean, JoinIds]> {
    const work = reverseChain.slice();
    const firstItem = work.shift();
    if (!firstItem) {
      throw new Error("DisableJoinsAssociationScope: empty chain");
    }
    const firstFk = (firstItem as { joinForeignKey: string | string[] }).joinForeignKey;
    const firstFkCols = keyColumns(firstFk, "joinForeignKey");
    const seedTuple = readTuple(owner, firstFkCols);
    const initialIds: JoinIds = firstFkCols.length === 1 ? [seedTuple[0]] : [seedTuple];
    let acc: [ChainEntry, boolean, JoinIds] = [firstItem, false, initialIds];

    for (const nextReflection of work) {
      const [reflection, ordered, joinIds] = acc;
      const foreignKey = (nextReflection as { joinForeignKey: string | string[] }).joinForeignKey;
      const foreignKeyCols = keyColumns(foreignKey, "joinForeignKey");
      // Empty join_ids → `where(key => [])` is a null relation, so Rails'
      // `pluck` runs no query (disable_joins_association_scope.rb:21-28). Skip
      // the pluck at every intermediate step (not just the tail) so a chain
      // whose middle step plucks empty emits no extra query — and the final
      // step below is short-circuited via `none()` for the same reason.
      if (joinIds.length === 0) {
        acc = [nextReflection, false, []];
        continue;
      }
      const keyCols = keyColumns(
        resolveJoinPrimaryKey(reflection, (reflection as { klass?: typeof Base }).klass),
        "joinPrimaryKey",
      );
      const records = this._addConstraintsDj(reflection, keyCols, joinIds, owner, ordered);
      const recordIds = (await (
        records as { pluck: (...cols: string[]) => Promise<unknown[]> }
      ).pluck(...foreignKeyCols)) as JoinIds;
      const ord = records as { orderValues?: unknown[] };
      const recordsOrdered = any(ord.orderValues ?? []);
      acc = [nextReflection, recordsOrdered, recordIds];
    }
    return acc;
  }

  /**
   * Build a per-step scope: `reflection.build_scope(reflection.aliased_table)
   * .where(key IN ids)` merged with
   * `scope_for_association` (minus the joined/eager-load options that
   * would conflict with the disabled-joins shape) and any reflection
   * `constraints()` (where_clause += / order_values |=).
   *
   * If the source step has no ORDER but an upstream step was ordered,
   * wrap in `DisableJoinsAssociationRelation` so loaded records come
   * back in IN-list order.
   *
   * Mirrors: DisableJoinsAssociationScope#add_constraints (lines 33-56).
   *
   * @missingRailsCall add_constraints — PERMANENT: Rails' subclass method shadows
   * `AssociationScope#add_constraints` with a different arity, which Ruby
   * permits. TypeScript rejects a derived declaration of a name the base
   * declares `private` (TS2415), and the two signatures are not
   * override-compatible, so the `Dj` suffix is the only spelling available;
   * `scope()` still calls it at both of Rails' call sites.
   */
  private _addConstraintsDj(
    reflection: ChainEntry,
    keyCols: string[],
    joinIds: JoinIds,
    owner: Base,
    ordered: boolean,
  ): unknown {
    const klass = (reflection as { klass: typeof Base }).klass;
    let scope: unknown = (
      reflection as unknown as {
        buildScope(table?: unknown): unknown;
        aliasedTable?: unknown;
      }
    ).buildScope((reflection as { aliasedTable?: unknown }).aliasedTable);
    if (keyCols.length === 1) {
      // Single-column key: hash WHERE typically compiles to
      // `key IN (?, ?, ...)`. The PredicateBuilder array handler
      // splits null entries into a separate `OR key IS NULL` branch,
      // so the exact emitted shape depends on whether `joinIds`
      // contains nulls (rare in the chain-walk's pluck output, but
      // possible). Matches Rails' `disable_joins_association_scope.rb:34`:
      // `reflection.build_scope(...).where(key => join_ids)`.
      scope = (scope as { where: (c: Record<string, unknown>) => unknown }).where({
        [keyCols[0]]: joinIds,
      });
    } else {
      const arity = keyCols.length;
      const tuples = joinIds.map((t, i) => {
        if (!Array.isArray(t)) {
          throw argumentError(
            `DisableJoinsAssociationScope: composite joinIds[${i}] must be an array (got ${typeof t})`,
          );
        }
        if (t.length !== arity) {
          throw argumentError(
            `DisableJoinsAssociationScope: composite joinIds[${i}] arity ${t.length} does not match key columns [${keyCols.join(", ")}] (arity ${arity})`,
          );
        }
        return t;
      }) as unknown[][];
      scope = (scope as { where: (c: string[], t: unknown[][]) => unknown }).where(keyCols, tuples);
    }

    const sfa = (
      klass as unknown as { scopeForAssociation?: () => unknown }
    ).scopeForAssociation?.();
    if (sfa) {
      // Rails: `scope.merge!(relation.except(:select, :create_with, :includes,
      // :preload, :eager_load, :joins, :left_outer_joins))`
      // (disable_joins_association_scope.rb:36). `except` removes the value
      // only — it must NOT record `unscope_values`, or the `unscope` step of
      // `Merger#merge`'s NORMAL_VALUES loop (merger.rb:57-66) would replay the
      // resets into `scope` and erase its own parts.
      const stripped = (sfa as { except: (...keys: ExceptKey[]) => unknown }).except(
        "select",
        "createWith",
        "includes",
        "preload",
        "eagerLoad",
        "joins",
        "leftOuterJoins",
      );
      scope = (scope as { merge: (o: unknown) => unknown }).merge(stripped);
    }

    const constraints =
      (
        reflection as { constraints?: () => Array<(...args: unknown[]) => unknown> }
      ).constraints?.() ?? [];
    for (const scopeChainItem of constraints) {
      if (typeof scopeChainItem !== "function") continue;
      const item = this.evalScope(reflection, scopeChainItem, owner); // Rails: `scope.unscope!(*item.unscope_values)`,
      // `scope.where_clause += item.where_clause`,
      // `scope.order_values = item.order_values | scope.order_values`
      // (disable_joins_association_scope.rb:41-47). The join-less variant
      // merges only those three — no head-scope `merge!`, no referenced-joins
      // arm, since this path never builds a JOIN.
      const itemUnscope = (item as { unscopeValues?: unknown[] }).unscopeValues ?? [];
      if (itemUnscope.length > 0) {
        (scope as { unscopeBang: (...v: unknown[]) => unknown }).unscopeBang(...itemUnscope);
      }
      const merged = scope as { whereClause: WhereClause; orderValues?: unknown[] };
      const itemPredicates =
        (item as { whereClause?: { predicates?: unknown[] } }).whereClause?.predicates ?? [];
      if (itemPredicates.length > 0) {
        merged.whereClause = merged.whereClause.plus(
          new WhereClause(itemPredicates as Nodes.Node[]),
        );
      }
      const itemOrders = (item as { orderValues?: unknown[] }).orderValues ?? [];
      if (itemOrders.length > 0) {
        merged.orderValues = unionOrderClauses(itemOrders, merged.orderValues ?? []);
      }
      scope = merged;
    }

    const finalOrd = scope as { orderValues?: unknown[] };
    const finalOrders = (finalOrd.orderValues?.length ?? 0) > 0 ? [1] : [];
    if (finalOrders.length === 0 && ordered) {
      if ((scope as { _isNone: boolean })._isNone) return scope;
      const Ctor = disableJoinsAssociationRelationClassFor(klass);
      const split =
        keyCols.length === 1
          ? new Ctor(klass, keyCols[0], joinIds as unknown[])
          : new Ctor(klass, keyCols, joinIds as unknown[][]);
      // Rails' `where_clause +=` shape (association_scope.rb:153): assign through
      // the writer rather than appending to the read value — an unset `:where`
      // key hands back a fresh `WhereClause.empty()` on every getter call, so an
      // in-place push would never reach `split`'s own `@values`.
      const sourceWhere = (scope as { whereClause?: WhereClause }).whereClause;
      if (sourceWhere && sourceWhere.predicates.length > 0) {
        const target = split as unknown as { whereClause: WhereClause };
        target.whereClause = target.whereClause.plus(sourceWhere);
      }
      return split;
    }
    return scope;
  }
}

setDjasScopeBuilder((assoc) =>
  DisableJoinsAssociationScope.create().scope(assoc as AssociationScopeable),
);
