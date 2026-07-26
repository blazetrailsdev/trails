import type { Base } from "../base.js";
import type { AssociationDefinition, AssociationOptions } from "../associations.js";
import {
  _builtAssociationScope,
  _canRouteThroughViaDisableJoinsAssociationScope,
  _findTargetReachable,
  _inlineOwnerKey,
  _inlinePolymorphicKeys,
  _loadThroughViaDisableJoinsScope,
  _ownerChainReflection,
  _preloadedHolderTarget,
  _resolveInverseName,
  _routeThroughViaAssociationScope,
  _scopeForAssociation,
  _violatesStrictLoading,
  _wireInverseAssociation,
  applyAssociationScope,
  loadHasManyThrough,
  ownerReflectionForeignKey,
  resolveAssocClass,
  syncToAssociationInstance,
  validateInverseOf,
} from "../associations.js";
import { strictLoadingViolationBang } from "../core.js";
import {
  validateThroughReflection,
  routeThroughCheckValidity,
} from "./validate-through-reflection.js";
import { CompositePrimaryKeyMismatchError, DeleteRestrictionError } from "./errors.js";
import { polymorphicName } from "../inheritance.js";
import { RecordInvalid } from "../validations.js";
import { CollectionAssociation, includesRecord } from "./collection-association.js";
import { ForeignAssociation } from "./foreign-association.js";
import { compositeQueryConstraintsList } from "../persistence.js";
import { camelize, singularize, underscore } from "@blazetrails/activesupport";

/**
 * Proxy that handles a has_many association.
 *
 * Adds counter cache awareness, dependent handling, and FK setup
 * on record insertion. Delegates collection behavior to
 * CollectionAssociation and load functions in associations.ts.
 *
 * Mirrors: ActiveRecord::Associations::HasManyAssociation
 */
export class HasManyAssociation extends CollectionAssociation {
  constructor(owner: Base, definition: AssociationDefinition) {
    super(owner, definition);
  }

  /**
   * Set difference (Ruby's `a - b`) over AR record equality — a record present
   * anywhere in `b` is excluded from the result however many times it occurs.
   *
   * Mirrors: ActiveRecord::Associations::HasManyAssociation#difference
   */
  protected override difference(a: Base[], b: Base[]): Base[] {
    return setDifference(a, b);
  }

  /**
   * Set intersection (Ruby's `a & b`) over AR record equality.
   *
   * Mirrors: ActiveRecord::Associations::HasManyAssociation#intersection
   */
  protected override intersection(a: Base[], b: Base[]): Base[] {
    return setIntersection(a, b);
  }

  /**
   * Handle the :dependent option when the owner is being destroyed.
   * Supports: restrict_with_exception, restrict_with_error, destroy,
   * nullify, delete (delete_all).
   */
  async handleDependency(): Promise<void | false> {
    const dependent = this.reflection.options.dependent;
    if (!dependent) return;

    switch (dependent) {
      case "restrictWithException": {
        const records = await this.loadTarget();
        if (records.length > 0) {
          throw new DeleteRestrictionError(this.owner, this.reflection.name);
        }
        break;
      }

      case "restrictWithError": {
        const records = await this.loadTarget();
        if (records.length > 0) {
          // Rails: owner.errors.add(:base, ...); throw(:abort). The owner is
          // NOT destroyed and no exception is raised — `destroy` returns false.
          // We signal :abort to the before_destroy chain by returning false.
          const owner = this.owner as Base & {
            errors: { add(a: string, t: string, opts?: Record<string, unknown>): void };
          };
          const ctor = owner.constructor as typeof Base & {
            humanAttributeName(attr: string): string;
          };
          const record = ctor.humanAttributeName(this.reflection.name).toLowerCase();
          owner.errors.add("base", "invalid", {
            message: `Cannot delete record because dependent ${record} exist`,
          });
          return false;
        }
        break;
      }

      case "destroy": {
        const records = await this.loadTarget();
        for (const record of records) {
          (record as any).destroyedByAssociation = this.reflection;
        }
        // Rails: `handle_dependency` does NOT rescue here. The child's
        // RecordNotDestroyed propagates through the before_destroy callback chain
        // and is rescued by Callbacks#destroy on the OWNER, which stores it as
        // @_association_destroy_exception and returns false. destroy! then
        // re-raises that stored exception via _raise_record_not_destroyed so
        // error.record is the failed child, not the owner.
        //
        // Mirrors that: let RecordNotDestroyed propagate; addDestroyCallbacks
        // (builder/association.ts) catches it, stores it on the owner, and
        // calls throwAbort() so the owner's destroy() returns false. destroyBang
        // then calls _raiseRecordNotDestroyed() which re-raises the child exception.
        await this.destroyAll();
        break;
      }

      case "nullify":
        await this.deleteAll("nullify");
        break;

      default:
        await this.deleteAll();
    }
  }

  /**
   * Insert a record into the collection. Sets the FK and type
   * columns on the record to point to the owner, then saves.
   * Rails: if raise is true, uses save! (raises on failure);
   * otherwise uses save (returns boolean).
   */
  async insertRecord(record: Base, validate = true, raise = false): Promise<boolean> {
    this.setOwnerAttributes(record);
    let saved = false;
    if (typeof (record as any).save === "function") {
      saved = !!(await (record as any).save({ validate }));
      if (!saved && raise) throw new RecordInvalid(record);
    }
    // Rails: update_counter_if_success(super, 1) — sync counter on successful insert
    return updateCounterIfSuccess(this, saved, 1);
  }

  /**
   * Fetch the collection's target records.
   *
   * Mirrors: ActiveRecord::Associations::Association#find_target
   * (association.rb:248) as reached through `CollectionAssociation#load_target`
   * (collection_association.rb:272). This is the association-instance entry
   * point; it wraps the functional loader below, which the CollectionProxy and
   * the through-association loaders reach without an association instance.
   */
  protected override async findTarget(): Promise<Base[]> {
    // Every caller assigns the returned records into this holder itself, so the
    // loader's tail writeback into the same holder is redundant — and, because
    // it lands mid-await, clobbers any reassignment made while the query was in
    // flight. See `_loaderWritebackSuppressed`.
    this._loaderWritebackSuppressed++;
    try {
      return await findTarget(this.owner, this.reflection.name, this.reflection.options);
    } finally {
      this._loaderWritebackSuppressed--;
    }
  }

  protected override setOwnerAttributes(record: Base): void {
    if (this.reflection.options.through) return;
    super.setOwnerAttributes(record);
  }

  /**
   * Source the FK/type-column null map from the Rails-named helper so
   * `dependent: :nullify` honors the rich reflection (custom foreignKey,
   * polymorphic foreignType, composite PKs).
   */
  protected override computeNullifiedOwnerAttributes(): Record<string, null> {
    return nullifiedOwnerAttributes(this);
  }

  /**
   * Mirrors Rails' `HasManyAssociation#delete_or_nullify_all_records`
   * (via `delete_count` + `update_counter`, has_many_association.rb): the
   * `delete_all` dispatch point. Deletes the scoped rows for `"deleteAll"`,
   * otherwise (including the `nil`/`undefined` default) nullifies their FK —
   * then decrements the counter cache by the affected count.
   * @internal
   */
  protected override async deleteOrNullifyAllRecords(method?: string): Promise<void> {
    const scope = (this as any).scope?.();
    if (!scope) return;
    const count = await deleteCount(this, method ?? "", scope);
    if (count > 0) await updateCounter(this, -count);
  }

  /**
   * Delete the given records per the `:dependent` strategy. Reached from
   * `removeRecords` (after `before_remove` fires), so `dependent: :destroy`
   * on `owner.destroy` now destroys children through the callback path.
   *
   * Mirrors: ActiveRecord::Associations::HasManyAssociation#delete_records —
   * `:destroy` destroys each record; otherwise a bulk delete/nullify scoped
   * to the records, decrementing the counter cache by the affected count.
   * @internal
   */
  protected override async deleteRecords(records: Base[], method: string): Promise<number> {
    if (method === "destroy") {
      // Rails: records.each(&:destroy!).
      for (const record of records) await (record as any).destroyBang();
      // Rails: update_counter(-records.length) unless reflection.inverse_updates_counter_cache?
      // The destroy callbacks decrement the owner's counter through the child's
      // belongs_to inverse (CounterCache#destroy_row) only when that inverse points
      // at THIS reflection's counter column; otherwise (e.g. a has_many `counter_cache:`
      // distinct from the inverse's) decrement here so we don't silently skip it.
      const ctor = this.owner.constructor as typeof Base & {
        _reflectOnAssociation?: (
          n: string,
        ) => { inverseWhichUpdatesCounterCache?: () => unknown } | undefined;
      };
      const refl = ctor._reflectOnAssociation?.(this.reflection.name) ?? this.reflection;
      if (!(refl as any).inverseWhichUpdatesCounterCache?.()) {
        await updateCounter(this, -records.length);
      }
      return records.length;
    }
    // delete_all / nullify (Rails delete_records else-branch). Reached only via the
    // association-layer `delete` with a dependent strategy; non-through has_many
    // `delete` is intercepted by the CollectionProxy. Scope to the given records by
    // their query-constraint columns so we delete/nullify only those rows.
    const baseScope = (this as any).scope?.();
    if (!baseScope) return 0;
    const queryConstraints = compositeQueryConstraintsList.call(this.klass as any);
    const scope = scopeForRecords(baseScope, queryConstraints, records);
    // Canonical models map Rails' `dependent: :delete_all` to the `"delete"`
    // string (deleteAll is not yet in the AssociationOptions type), so normalize
    // it to the delete_all strategy here the same way `deleteAll()` does
    // (collection-association.ts). Without this the per-record delete path falls
    // through to nullify, which fails for NOT-NULL composite-PK foreign keys.
    const strategy = method === "delete" ? "deleteAll" : method;
    const count = await deleteCount(this, strategy, scope);
    if (count > 0) await updateCounter(this, -count);
    return count;
  }

  /**
   * Counts the collection's records, applying the counter cache, the
   * `limit_value` clamp, and the empty-DB loaded side-effect.
   *
   * Mirrors: ActiveRecord::Associations::HasManyAssociation#count_records
   * @internal
   */
  async countRecords(): Promise<number> {
    const ctor = this.owner.constructor as typeof Base & {
      _reflectOnAssociation?: (n: string) => unknown;
    };
    const refl = (ctor._reflectOnAssociation?.(this.reflection.name) ?? this.reflection) as {
      hasActiveCachedCounter?: () => boolean;
      counterCacheColumn?: () => string | null;
    };
    return countRecords({
      hasActiveCachedCounter: () => refl.hasActiveCachedCounter?.() ?? false,
      counterCacheColumn: () => refl.counterCacheColumn?.() ?? null,
      readCounterAttribute: (col) => (this.owner as any).readAttribute(col),
      countViaScope: async () => {
        const rel = (this as any).scope?.();
        return rel && typeof rel.count === "function"
          ? await rel.count()
          : (this as CollectionAssociation).target.length;
      },
      limitValue: () =>
        ((this as CollectionAssociation).scope() as { limitValue?: number | null })?.limitValue ??
        null,
      retainOnlyNewRecords: () => {
        const self = this as CollectionAssociation;
        self.target = self.target.filter((r) => r.isNewRecord());
      },
      markLoaded: () => (this as CollectionAssociation).loadedBang(),
    });
  }
}

/**
 * Host surface `countRecords` needs, abstracting the OO association and the
 * CollectionProxy (which keep their cardinality in different fields).
 * @internal
 */
export interface CountRecordsHost {
  hasActiveCachedCounter(): boolean;
  counterCacheColumn(): string | null;
  readCounterAttribute(column: string): unknown;
  countViaScope(): Promise<number>;
  limitValue(): number | null;
  retainOnlyNewRecords(): void;
  markLoaded(): void;
}

/**
 * Mirrors ActiveRecord::Associations::HasManyAssociation#count_records
 * (has_many_association.rb): read the counter cache when active, otherwise
 * `scope.count(:all)`; when the DB is empty purge non-new records and mark the
 * target loaded — a documented side-effect that may avoid an extra SELECT —
 * then clamp to `[association_scope.limit_value, count].compact.min`.
 * @internal
 */
export async function countRecords(host: CountRecordsHost): Promise<number> {
  let count: number;
  if (host.hasActiveCachedCounter()) {
    // has_active_cached_counter? guarantees a counter column, but guard against
    // a null column anyway — `nil.to_i == 0` in Rails.
    const column = host.counterCacheColumn();
    count = column == null ? 0 : toI(host.readCounterAttribute(column));
  } else {
    count = await host.countViaScope();
  }

  if (count === 0) {
    host.retainOnlyNewRecords();
    host.markLoaded();
  }

  const limitValue = host.limitValue();
  return limitValue == null ? count : Math.min(limitValue, count);
}

/** Ruby `Object#to_i` semantics: nil → 0, leading-integer parse otherwise. */
function toI(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return Math.trunc(value);
  if (typeof value === "bigint") return Number(value);
  const n = Number.parseInt(String(value), 10);
  return Number.isNaN(n) ? 0 : n;
}

/** @internal */
async function updateCounter(assoc: HasManyAssociation, difference: number): Promise<void> {
  const counterCol = assoc.reflection.options.counterCache;
  if (!counterCol) return;
  const owner = assoc.owner as any;
  const column = String(counterCol);
  if (typeof owner.incrementBang === "function") {
    await owner.incrementBang(column, difference);
  } else if (typeof owner.updateCounters === "function") {
    await owner.updateCounters({ [column]: difference });
  } else if (typeof owner.increment === "function") {
    owner.increment(column, difference);
  }
}

/**
 * Mirrors ActiveRecord::Associations::CollectionAssociation#update_counter_in_memory:
 * the has_many bumps the owner's counter in memory only when
 * `counter_must_be_updated_by_has_many?` — otherwise, with counter_cache on
 * both sides, this bump leaks into the belongs_to `increment!` delta
 * (in_memory − in_database) on the next insert and inflates the counter.
 * @internal
 */
function updateCounterInMemory(assoc: HasManyAssociation, difference: number): void {
  const counterCol = assoc.reflection.options.counterCache;
  if (!counterCol) return;
  // `assoc.reflection` is the raw definition; resolve the rich reflection the
  // same way `deleteRecords` does above.
  const ctor = assoc.owner.constructor as typeof Base & {
    _reflectOnAssociation?: (n: string) => { isCounterMustBeUpdatedByHasMany?: () => boolean };
  };
  const refl = ctor._reflectOnAssociation?.(assoc.reflection.name);
  if (refl?.isCounterMustBeUpdatedByHasMany?.() === false) return;
  const owner = assoc.owner as any;
  const column = String(counterCol);
  const current = Number(owner.readAttribute?.(column) ?? 0);
  owner.writeAttribute?.(column, current + difference);
  owner.clearAttributeChange?.(column);
}

/** @internal */
function deleteCount(assoc: HasManyAssociation, method: string, scope: any): Promise<number> {
  // Rails: delete_all → scope.delete_all; nullify → scope.update_all(nullified_owner_attributes).
  if (method === "deleteAll") return scope.deleteAll?.() ?? Promise.resolve(0);
  const nullAttrs = (
    assoc as unknown as {
      computeNullifiedOwnerAttributes(): Record<string, null>;
    }
  ).computeNullifiedOwnerAttributes();
  return scope.updateAll?.(nullAttrs) ?? Promise.resolve(0);
}

/**
 * Restrict an association scope to the given records via their query-constraint
 * columns. Mirrors Rails' `scope.where(query_constraints => values)` from
 * `HasManyAssociation#delete_records` (has_many_association.rb:132–135).
 * Single-column PKs use `WHERE id IN (...)`; composite keys use the tuple form
 * `where(cols, tuples)` (OR-of-AND) to avoid the cartesian product that
 * `AND col1 IN (...) AND col2 IN (...)` would produce.
 * @internal
 */
function scopeForRecords(scope: any, queryConstraints: string[], records: Base[]): any {
  const readCol = (r: Base, col: string): unknown =>
    typeof (r as any)._readAttribute === "function"
      ? (r as any)._readAttribute(col)
      : (r as any)[col];
  if (queryConstraints.length === 1) {
    const col = queryConstraints[0];
    return scope.where({ [col]: records.map((r) => readCol(r, col)) });
  }
  const tuples = records.map((r) => queryConstraints.map((col) => readCol(r, col)));
  return scope.where(queryConstraints, tuples);
}

/** @internal */
function updateCounterIfSuccess(
  assoc: HasManyAssociation,
  savedSuccessfully: boolean,
  difference: number,
): boolean {
  if (savedSuccessfully) updateCounterInMemory(assoc, difference);
  return savedSuccessfully;
}

/** @internal */
function difference(_assoc: HasManyAssociation, a: Base[], b: Base[]): Base[] {
  return a.filter((r) => !b.includes(r));
}

/** @internal */
function intersection(_assoc: HasManyAssociation, a: Base[], b: Base[]): Base[] {
  return a.filter((r) => b.includes(r));
}

/**
 * Build the attribute hash that nullifies the owner-side foreign key (and
 * polymorphic type column, when applicable) on dependent records — used by
 * `dependent: :nullify` bulk updates to drop the FK without destroying rows.
 *
 * Mirrors: ActiveRecord::Associations::ForeignAssociation#nullified_owner_attributes
 *
 * @internal
 */
function nullifiedOwnerAttributes(assoc: HasManyAssociation): Record<string, null> {
  // Resolve the rich reflection so foreignKey expansion (composite PKs,
  // primaryKey overrides, polymorphic foreignType) matches what the
  // association itself uses. Fall back to the CollectionAssociation's
  // own FK column derivation, then to the simple options-based shape.
  const ctor = assoc.owner.constructor as {
    name: string;
    _reflectOnAssociation?: (n: string) => {
      foreignKey?: string | string[];
      foreignType?: string;
    } | null;
  };
  const refl = ctor._reflectOnAssociation?.(assoc.reflection.name) ?? null;
  let foreignKey: string | string[] | undefined = refl?.foreignKey;
  const typeCol: string | null = refl?.foreignType ?? null;
  if (foreignKey == null) {
    const fks = (assoc as unknown as { foreignKeyColumns?: () => string[] }).foreignKeyColumns?.();
    if (fks?.length) foreignKey = fks;
  }
  if (foreignKey == null) {
    const opts = assoc.reflection.options as { foreignKey?: string | string[]; as?: string };
    foreignKey =
      opts.foreignKey ?? (opts.as ? `${underscore(opts.as)}_id` : `${underscore(ctor.name)}_id`);
  }
  const polyType = typeCol ?? deriveAsTypeCol(assoc);
  return ForeignAssociation.nullifiedOwnerAttributes({ foreignKey, type: polyType });
}

function deriveAsTypeCol(assoc: { reflection: { options: { as?: string } } }): string | null {
  const asName = assoc.reflection.options.as;
  return asName ? `${underscore(asName)}_type` : null;
}

/**
 * Bodies of `HasManyAssociation#difference` / `#intersection`, exposed so the
 * `CollectionProxy` replace path — which is one class covering both the plain
 * and the `:through` reflection, and so cannot pick a diff by inheritance —
 * can reach the same set semantics the OO association uses.
 * @internal
 */
export function setDifference(a: Base[], b: Base[]): Base[] {
  return a.filter((record) => !includesRecord(b, record));
}

/** @internal */
export function setIntersection(a: Base[], b: Base[]): Base[] {
  return a.filter((record) => includesRecord(b, record));
}

/**
 * Find the has_many association's target records.
 *
 * The functional body behind `HasManyAssociation#findTarget`, which is the
 * Rails-shaped entry point (`ActiveRecord::Associations::Association#find_target`,
 * association.rb:248). It takes the owner/name/options triple rather than an
 * association instance because the CollectionProxy load path and the
 * through-association loaders reach the loader without one; that triple shape
 * is a trails-only calling convention, not Rails surface.
 *
 * @internal
 */
export async function findTarget(
  record: Base,
  assocName: string,
  options: AssociationOptions,
  queryExecutor?: () => Promise<Base[]>,
): Promise<Base[]> {
  if (options.through) {
    validateThroughReflection(record.constructor as typeof Base, assocName);
  }
  // Check cached (inverse_of) first, then preloaded — skip when a scope
  // override is provided (the scope has been mutated; the cache would return
  // stale/incorrect data for the diverged query).
  if (!queryExecutor) {
    // Honor an instance-cache hit (a directly-seeded or inverse-seeded
    // collection target), but ignore the association's *own* collection proxy:
    // its in-memory built/pushed records are not a complete collection and must
    // still be merged with a DB query (this loader runs inside that proxy's
    // load path, where `proxy.loaded` is false by construction).
    const cache = record._associationCache(assocName);
    if (
      cache &&
      cache !== record._collectionProxies.get(assocName) &&
      Array.isArray(cache.target) &&
      !(typeof (cache as any).isStaleTarget === "function" && (cache as any).isStaleTarget())
    ) {
      return cache.target;
    }
    const preloaded = _preloadedHolderTarget(record, assocName);
    if (preloaded) {
      return (preloaded.value ?? []) as Base[];
    }
  }

  // Strict loading check. Gated by `find_target?`: a new-record owner without
  // the FK present never reaches `find_target` and so never raises.
  if (
    _violatesStrictLoading(record, options) &&
    _findTargetReachable(record, assocName, options, "foreign")
  ) {
    strictLoadingViolationBang(record, assocName, {
      className: options.className ?? camelize(singularize(assocName)),
    });
  }

  // Scope-override path: CollectionProxy passes this when its Relation state
  // has been mutated (whereBang / orderBang / ...). The executor runs the
  // mutated scope directly; cache lookup and scope rebuild are bypassed.
  if (queryExecutor) return queryExecutor();

  // Handle through associations. Routes through AssociationScope's
  // JOIN-based path for the simple shape (see
  // _canRouteThroughViaAssociationScope); everything else stays on the
  // 2-step loadHasManyThrough.
  if (options.through) {
    const ctorEarly = record.constructor as typeof Base;
    const reflEarly = ctorEarly._reflectOnAssociation?.(assocName);
    if (_canRouteThroughViaDisableJoinsAssociationScope(reflEarly, options)) {
      return _loadThroughViaDisableJoinsScope(record, reflEarly, options);
    }
    // Nested-through shapes flatten their whole `reflection.chain` into the
    // JOIN-based AssociationScope path below, sharing its inverse-wiring and
    // null-FK short-circuit. An unsaved owner resolves its through step from
    // the in-memory association target (e.g. `post.author = mary` before save),
    // which the SQL JOIN cannot see — `_routeThroughViaAssociationScope` keeps
    // those on the 2-step loader.
    if (!_routeThroughViaAssociationScope(record, reflEarly, options)) {
      return loadHasManyThrough(record, assocName, options);
    }
    // Fall through into the AssociationScope path below.
  }

  const ctor = record.constructor as typeof Base;
  const className = options.className ?? camelize(singularize(assocName));
  const primaryKey = options.primaryKey ?? ctor.primaryKey;

  const targetModel = resolveAssocClass(record, assocName, className);

  if (options.inverseOf) {
    validateInverseOf(targetModel, assocName, options.inverseOf);
  }

  // Resolve FK columns (may be array for CPK; `:as` swaps to the
  // polymorphic FK column). Prefer the rich reflection's foreign key so an STI
  // subclass owner uses the declaring class's column (see
  // `ownerReflectionForeignKey`).
  const foreignKey = options.as
    ? (options.foreignKey ?? `${underscore(options.as)}_id`)
    : (options.foreignKey ??
      ownerReflectionForeignKey(ctor, assocName) ??
      (options.queryConstraints
        ? options.queryConstraints
        : Array.isArray(primaryKey)
          ? primaryKey.map((col: string) => `${underscore(ctor.name)}_${col}`)
          : `${underscore(ctor.name)}_id`));

  // Polymorphic `:as` requires a scalar FK. A composite FK is always
  // rejected. A composite owner PK collapses to "id" when present
  // (matching Rails' join_id_for); otherwise reject.
  if (options.as) {
    if (Array.isArray(foreignKey)) {
      // Route through the reflection's canonical checkValidityBang (Rails'
      // single raise site) so the error carries the Rails-faithful message;
      // a no-op for polymorphic `:as` (Rails permits no composite key there).
      routeThroughCheckValidity(ctor, assocName);
      // No reflection resolvable — minimal trails-only fallback guard.
      throw new CompositePrimaryKeyMismatchError({
        activeRecord: ctor.name,
        name: assocName,
        primaryKey,
        foreignKey,
      });
    }
    if (Array.isArray(primaryKey) && !primaryKey.includes("id")) {
      // Route through the reflection's canonical checkValidityBang (Rails'
      // single raise site) so the error carries the Rails-faithful message;
      // a no-op for polymorphic `:as` (Rails permits no composite key there).
      routeThroughCheckValidity(ctor, assocName);
      // No reflection resolvable — minimal trails-only fallback guard.
      throw new CompositePrimaryKeyMismatchError({
        activeRecord: ctor.name,
        name: assocName,
        primaryKey,
        foreignKey,
      });
    }
  }
  // Route through AssociationScope when we have a reflection registered.
  // AssociationScope handles scalar, composite, polymorphic `:as`, and
  // STI in a single path matching Rails' `AssociationScope.scope`.
  // Inline fallback only when the reflection hasn't been registered
  // (happens in tests that define associations via the lower-level API
  // without going through Reflection.create).
  const reflection = ctor._reflectOnAssociation?.(assocName);
  // Null-FK short-circuit: read the SAME columns the eventual query
  // reads. For non-through, reflection.joinForeignKey is the owner-
  // side activeRecordPrimaryKey for hasMany. For through reflections the
  // owner-side column is on `_ownerChainReflection` (chain.last).
  const reflForOwnerFk = _ownerChainReflection(reflection);
  const fkCheckPks = reflForOwnerFk
    ? Array.isArray(reflForOwnerFk.joinForeignKey)
      ? reflForOwnerFk.joinForeignKey
      : [reflForOwnerFk.joinForeignKey]
    : Array.isArray(primaryKey)
      ? primaryKey
      : [primaryKey];
  for (const pk of fkCheckPks) {
    const v = record._readAttribute(pk);
    if (v === null || v === undefined) return [];
  }

  let rel: any;
  if (reflection) {
    // Rails' `Association#scope` is
    //   AssociationRelation.create(klass, self).merge!(klass.scope_for_association)
    // (association.rb:313), so the unscoped+constraints relation MUST
    // be merged with `klass.scope_for_association` — otherwise default_scope
    // / scope extensions silently disappear. AssociationScope.scope
    // already merges `reflection.scope` (macro-time lambda) via scopeFor;
    // skip re-applying `options.scope` ONLY when it's that exact same
    // function. Callers like `loadHasManyThrough` synthesize a NEW
    // `options.scope` (wrapping with `sourceType` filtering) — those
    // must still run.
    const built = _builtAssociationScope(record, assocName, reflection, targetModel);
    const baseRelation = _scopeForAssociation(targetModel);
    rel = baseRelation.merge(built);
    rel = applyAssociationScope(rel, options.scope, record, reflection.scope);
  } else {
    // Inline fallback: no reflection (lower-level test helpers).
    if (Array.isArray(foreignKey)) {
      const ownerKey = _inlineOwnerKey(ctor, options, primaryKey);
      const pkCols = Array.isArray(ownerKey) ? ownerKey : [ownerKey];
      if (pkCols.length !== foreignKey.length) {
        // Route through the reflection's canonical checkValidityBang (Rails'
        // single raise site) so the error carries the Rails-faithful message.
        routeThroughCheckValidity(ctor, assocName);
        // No reflection registered (lower-level test helper) — minimal guard.
        throw new CompositePrimaryKeyMismatchError({
          activeRecord: ctor.name,
          name: assocName,
          primaryKey: pkCols,
          foreignKey,
        });
      }
      const conditions: Record<string, unknown> = {};
      for (let i = 0; i < foreignKey.length; i++) {
        conditions[foreignKey[i]] = record._readAttribute(pkCols[i]);
      }
      rel = _scopeForAssociation(targetModel).where(conditions);
    } else if (options.as) {
      const typeCol = `${underscore(options.as)}_type`;
      const { fkCols, ownerKeyCols } = _inlinePolymorphicKeys(
        ctor,
        options,
        primaryKey,
        foreignKey,
      );
      const conditions: Record<string, unknown> = { [typeCol]: polymorphicName(ctor) };
      for (let i = 0; i < fkCols.length; i++) {
        conditions[fkCols[i]] = record._readAttribute(ownerKeyCols[i]);
      }
      rel = _scopeForAssociation(targetModel).where(conditions);
    } else {
      const ownerKey = _inlineOwnerKey(ctor, options, primaryKey);
      rel = _scopeForAssociation(targetModel).where({
        [foreignKey]: record._readAttribute(ownerKey as string),
      });
    }
    rel = applyAssociationScope(rel, options.scope, record);
  }
  // Set inverse_of on each loaded child. Resolve via the reflection so
  // automatic_inverse_of also wires each child's parent reference.
  // Mirrors HasManyAssociation#set_inverse_instance. Wiring runs inside the
  // instantiation block (Rails' `find_target` yields `set_inverse_instance`
  // per record) so it lands BEFORE the child's find/initialize callbacks.
  const inverseName = _resolveInverseName(ctor, assocName, options);
  if (inverseName) {
    rel._instantiateBlock = (child: Base) => {
      _wireInverseAssociation(record, child, inverseName);
    };
  }
  const results: Base[] = await rel.toArray();

  syncToAssociationInstance(record, assocName, results);
  return results;
}
