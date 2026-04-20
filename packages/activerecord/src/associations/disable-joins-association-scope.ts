import {
  AssociationScope,
  ReflectionProxy,
  type AssociationScopeable,
  type ValueTransformation,
} from "./association-scope.js";
import { DisableJoinsAssociationRelation } from "../disable-joins-association-relation.js";
import type { Relation } from "../relation.js";
import type { UnscopeType } from "../relation/query-methods.js";
import type { Base } from "../base.js";
import type { AbstractReflection } from "../reflection.js";
import { argumentError } from "../relation/query-methods.js";

type ChainEntry = AbstractReflection | ReflectionProxy;

/**
 * Join-id accumulator shape across the chain walk. Single-column keys
 * carry a flat list of scalars (`unknown[]`); composite keys carry a
 * list of tuples (`unknown[][]`). The shape per iteration is decided
 * by the step's key arity in `_addConstraintsDj` / `_lastScopeChain`.
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
  return cols.map((c) => owner.readAttribute(c));
}

/**
 * Resolve a reflection's `joinPrimaryKey` using the runtime-klass
 * form when the reflection exposes it. `BelongsToReflection#joinPrimaryKey`
 * hard-codes `"id"` for polymorphic sources since the target class
 * isn't known at definition time, but the resolved sourceType class
 * may use a custom PK (`uuid`, a composite, ...). Routing through
 * `joinPrimaryKeyFor(klass)` mirrors the AssociationScope walk
 * (association-scope.ts:_nextChainScope) and Rails'
 * `join_primary_key_for(klass)` (reflection.rb:968). Falls back to
 * the static `joinPrimaryKey` when the method isn't exposed (e.g.
 * chain entries that aren't Through / BelongsTo shapes).
 */
function resolveJoinPrimaryKey(reflection: unknown, klass?: typeof Base): string | string[] {
  const r = reflection as {
    joinPrimaryKey: string | string[];
    joinPrimaryKeyFor?: (klass?: typeof Base) => string | string[];
  };
  return typeof r.joinPrimaryKeyFor === "function" ? r.joinPrimaryKeyFor(klass) : r.joinPrimaryKey;
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
  static override readonly INSTANCE: DisableJoinsAssociationScope =
    DisableJoinsAssociationScope.create();

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
   */
  override scope(association: AssociationScopeable): unknown {
    const sourceReflection = association.reflection;
    const owner = association.owner;
    const klass = association.klass;
    // Boxed walker — see `DJAR.deferred` doc. The bare Relation must
    // never cross an `await` boundary, or Promise/A+ unwraps it via
    // the Relation thenable (`.then` → `toArray`). Build sync, box,
    // return the box.
    return DisableJoinsAssociationRelation.deferred(klass, async () => {
      const reverseChain = this._getChain(sourceReflection).slice().reverse();
      const [lastReflection, lastOrdered, lastJoinIds] = await this._lastScopeChain(
        reverseChain,
        owner,
      );
      // Prefer the runtime-klass form — `BelongsToReflection#joinPrimaryKey`
      // hard-codes `"id"` for polymorphic sources, but a sourceType
      // target may use a different PK (e.g. `uuid`). Mirrors the
      // AssociationScope chain walk which also routes through
      // joinPrimaryKeyFor (reflection.rb:968).
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
   */
  private async _lastScopeChain(
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
    // Single-column shape stays `[v1, v2, ...]` (one value per join
    // candidate). Composite shape becomes `[[v1a, v1b], ...]` (one
    // tuple per join candidate). The owner contributes exactly one
    // tuple as the chain seed.
    const seedTuple = readTuple(owner, firstFkCols);
    const initialIds: JoinIds = firstFkCols.length === 1 ? [seedTuple[0]] : [seedTuple];
    let acc: [ChainEntry, boolean, JoinIds] = [firstItem, false, initialIds];

    for (const nextReflection of work) {
      const [reflection, ordered, joinIds] = acc;
      const keyCols = keyColumns(
        resolveJoinPrimaryKey(reflection, (reflection as { klass?: typeof Base }).klass),
        "joinPrimaryKey",
      );
      const records = this._addConstraintsDj(reflection, keyCols, joinIds, owner, ordered);
      const foreignKey = (nextReflection as { joinForeignKey: string | string[] }).joinForeignKey;
      const foreignKeyCols = keyColumns(foreignKey, "joinForeignKey");
      // Pluck single column → `[v, v, ...]`; pluck multiple →
      // `[[v1a, v1b], ...]`. Forward as-is into the next iteration.
      const recordIds = (await (
        records as { pluck: (...cols: string[]) => Promise<unknown[]> }
      ).pluck(...foreignKeyCols)) as JoinIds;
      // `orderValues` covers `_orderClauses` (the parsed form); raw-SQL
      // orders (e.g. `inOrderOf`) live in `_rawOrderClauses` and are
      // invisible to the public getter. Check both so chain steps with
      // raw orders trigger the DJAR wrapping branch correctly.
      const ord = records as { orderValues?: unknown[]; _rawOrderClauses?: unknown[] };
      const recordsOrdered =
        (ord.orderValues?.length ?? 0) > 0 || (ord._rawOrderClauses?.length ?? 0) > 0;
      acc = [nextReflection, recordsOrdered, recordIds];
    }
    return acc;
  }

  /**
   * Build a per-step scope: `klass.unscoped.where(key IN ids)` merged with
   * `scope_for_association` (minus the joined/eager-load options that
   * would conflict with the disabled-joins shape) and any reflection
   * `constraints()` (where_clause += / order_values |=).
   *
   * If the source step has no ORDER but an upstream step was ordered,
   * wrap in `DisableJoinsAssociationRelation` so loaded records come
   * back in IN-list order.
   *
   * Mirrors: DisableJoinsAssociationScope#add_constraints (lines 33-56).
   */
  private _addConstraintsDj(
    reflection: ChainEntry,
    keyCols: string[],
    joinIds: JoinIds,
    owner: Base,
    ordered: boolean,
  ): unknown {
    const klass = (reflection as { klass: typeof Base }).klass;
    let scope: unknown = (klass as unknown as { unscoped: () => unknown }).unscoped();
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
      // Composite key: route through `Relation#where(cols, tuples)`,
      // which delegates to `PredicateBuilder.buildComposite`. That
      // helper handles null-component filtering (SQL tuple-equality
      // semantics), arity validation, single-column degeneracy → IN,
      // and bind-param emission via QueryAttribute. Empty/all-filtered
      // tuples become `Relation#none()`. No DJAS-local scaffolding.
      // Defense in depth: the chain walk constructs `joinIds` from
      // `pluck(...cols)` with `cols.length > 1`, which yields an
      // array of tuples. A bug upstream that hands us a flat list
      // (or mismatched arity) would otherwise surface deep inside
      // PredicateBuilder with a less actionable trace.
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
      // Rails: `relation.except(:select, :create_with, :includes, :preload,
      // :eager_load, :joins, :left_outer_joins)` strips those query parts
      // before merging. Our `Relation#except` is the SQL set-operation
      // EXCEPT (Rails-faithful for that name); the query-part strip is
      // `unscope(...)`. The full Rails set is now supported.
      const stripped = (sfa as { unscope: (...keys: UnscopeType[]) => unknown }).unscope(
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
    for (const c of constraints) {
      if (typeof c !== "function") continue;
      const entryScope = this._buildEntryScope(klass);
      const evaluated =
        c.length === 0
          ? (c as () => unknown).call(entryScope)
          : c.call(entryScope, entryScope, owner);
      scope = this._pushScopeIntoRelation(scope, evaluated);
    }

    // Same _rawOrderClauses guard as the chain-walk: a raw-SQL order on
    // the source step also disables the DJAR wrap.
    const finalOrd = scope as { orderValues?: unknown[]; _rawOrderClauses?: unknown[] };
    const finalOrders =
      (finalOrd.orderValues?.length ?? 0) > 0 || (finalOrd._rawOrderClauses?.length ?? 0) > 0
        ? [1]
        : [];
    if (finalOrders.length === 0 && ordered) {
      // If PredicateBuilder.buildComposite short-circuited to
      // `Relation#none()` (empty tuples / all-null components), the
      // scope is already a never-match. Skip the wrap: the fresh DJAR
      // would only copy `_whereClause.predicates` and lose `_isNone`,
      // causing a full-table SELECT instead of an empty result.
      if ((scope as { isNone: () => boolean }).isNone()) return scope;
      // Loaded-chain wrap: DJAR loads via SQL, then re-groups by the
      // join key and re-emits in `ids` order so callers see the
      // through-table ordering (SQL `IN(...)` / composite OR-of-AND
      // don't preserve list order). Both single-column and composite
      // keys are supported — DJAR serializes tuples for Map identity
      // so `[1, 100]` buckets collide as expected.
      // Branch over key arity so we hit DJAR's correlated overloads.
      // At this point `joinIds` is already shape-matched to `keyCols`
      // by the single-vs-composite branches in `_addConstraintsDj`.
      const split =
        keyCols.length === 1
          ? new DisableJoinsAssociationRelation<Base>(klass, keyCols[0], joinIds as unknown[])
          : new DisableJoinsAssociationRelation<Base>(klass, keyCols, joinIds as unknown[][]);
      const sourceWhere = (scope as { _whereClause?: { predicates?: unknown[] } })._whereClause;
      const splitWhere = (split as unknown as { _whereClause?: { predicates: unknown[] } })
        ._whereClause;
      if (sourceWhere?.predicates && splitWhere) {
        splitWhere.predicates.push(...sourceWhere.predicates);
      }
      return split;
    }
    return scope;
  }
}
