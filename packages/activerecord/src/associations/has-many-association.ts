import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
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
  _wireInverseAssociation,
  applyAssociationScope,
  resolveAssocClass,
  syncToAssociationInstance,
  validateInverseOf,
} from "../associations.js";
import { strictLoadingViolationBang } from "../core.js";
import {
  validateThroughReflection,
  routeThroughCheckValidity,
} from "./validate-through-reflection.js";
import {
  AssociationNotFoundError,
  CompositePrimaryKeyMismatchError,
  DeleteRestrictionError,
} from "./errors.js";
import { CollectionAssociation, includesRecord, isThenable } from "./collection-association.js";
import { ForeignAssociation, ownerForeignKeyColumns } from "./foreign-association.js";
import { compositeQueryConstraintsList, queryConstraintsList } from "../persistence.js";
import {
  camelize,
  eachSlice,
  selectBang,
  singularize,
  underscore,
} from "@blazetrails/activesupport";

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
  /**
   * Rails' `HasManyAssociation` counter-cache instance methods, installed onto
   * the prototype at the bottom of this file (the trails mixin idiom) so each
   * is called on `this` with Rails' own argument list.
   *
   * @internal
   */
  declare updateCounterInMemory: (difference: number) => void;
  /** @internal */
  declare updateCounterIfSuccess: <T>(savedSuccessfully: T, difference: number) => T;
  /** @internal */
  declare updateCounter: (difference: number, reflection?: AssociationDefinition) => Promise<void>;
  /** @internal */
  declare deleteCount: (method: string, scope: any) => Promise<number>;

  /**
   * Set on an ad-hoc holder built by a CollectionProxy whose own Relation state
   * has diverged from the seed (whereBang / orderBang / ...): `findTarget` then
   * runs that mutated Relation instead of rebuilding the association scope.
   * Rails has no counterpart because its CollectionProxy *is* the relation.
   * @internal
   */
  _queryExecutor?: () => Promise<Base[]>;

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
        if (!(await this.isEmpty())) {
          throw new DeleteRestrictionError(this.reflection.name);
        }
        break;
      }

      case "restrictWithError": {
        if (!(await this.isEmpty())) {
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
          owner.errors.add("base", ":restrict_dependent_destroy.has_many", { record });
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

      case "destroyAsync": {
        const records = await this.loadTarget();
        for (const t of records) {
          (t as any).destroyedByAssociation = this.reflection;
        }

        if (this.target.length > 0) {
          const associationClass = this.target[0].constructor as typeof Base;
          let primaryKeyColumn: string | string[];
          let ids: unknown[];
          if (queryConstraintsList.call(associationClass as any)) {
            primaryKeyColumn = queryConstraintsList.call(associationClass as any)!;
            ids = this.target.map((assoc) =>
              (primaryKeyColumn as string[]).map((col) => (assoc as any)[col]),
            );
          } else {
            primaryKeyColumn = associationClass.primaryKey as string;
            ids = this.target.map((assoc) => (assoc as any)[primaryKeyColumn as string]);
          }

          const idsBatches = eachSlice(
            ids,
            (this.owner.constructor as typeof Base).destroyAssociationAsyncBatchSize ?? ids.length,
          );
          for (const idsBatch of idsBatches) {
            this.enqueueDestroyAssociation({
              ownerModelName: this.owner.constructor.name,
              ownerId: (this.owner as any).id,
              associationClass: String((this.reflection.klass as typeof Base).name),
              associationIds: idsBatch,
              associationPrimaryKeyColumn: primaryKeyColumn,
              // Ruby `options.fetch(:ensuring_owner_was, nil)` returns a stored
              // `nil`/`false`; `??` would substitute the default for it.
              ensuringOwnerWasMethod:
                "ensuringOwnerWas" in this.reflection.options
                  ? (this.reflection.options as any).ensuringOwnerWas
                  : null,
            });
          }
        }
        break;
      }

      // Rails has no `:nullify` case — it falls through to the `else` arm,
      // whose bare `delete_all` reads `options[:dependent]` itself
      // (has_many_association.rb:56, collection_association.rb:157).
      default:
        await this.deleteAll();
    }
  }

  /**
   * Mirrors: ActiveRecord::Associations::HasManyAssociation#insert_record
   * (has_many_association.rb:61-64) — point the record's FK/type columns at the
   * owner, then delegate to `CollectionAssociation#insert_record`, which picks
   * the `save!` / `save` arm from `raise`.
   */
  override async insertRecord(
    record: Base,
    validate = true,
    raise = false,
    block?: (record: Base) => void,
  ): Promise<boolean> {
    this.setOwnerAttributes(record);
    return super.insertRecord(record, validate, raise, block);
  }

  /**
   * Fetch the collection's target records.
   *
   * Mirrors: ActiveRecord::Associations::Association#find_target
   * (association.rb:248) as reached through `CollectionAssociation#load_target`
   * (collection_association.rb:272). This is the association-instance entry
   * point; it wraps the module-private loader below, which the CollectionProxy
   * and the through-association loaders reach through an ad-hoc holder built by
   * `_buildAssociationInstance`.
   */
  protected override async findTarget(): Promise<Base[]> {
    // Every caller assigns the returned records into this holder itself, so the
    // loader's tail writeback into the same holder is redundant — and, because
    // it lands mid-await, clobbers any reassignment made while the query was in
    // flight. See `_loaderWritebackSuppressed`.
    this._loaderWritebackSuppressed++;
    try {
      const records = await findTarget(
        this.owner,
        this.reflection.name,
        this.reflection,
        this._queryExecutor,
        this.isViolatesStrictLoading(),
      );
      // Rails applies `set_strict_loading` per record inside `find_target`'s
      // instantiation block (association.rb:269-271), not in `load_target`.
      for (const record of records) this.setStrictLoading(record);
      return records;
    } finally {
      this._loaderWritebackSuppressed--;
    }
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
  protected override async deleteOrNullifyAllRecords(method?: string): Promise<number> {
    const count = await this.deleteCount(method ?? "", (this as any).scope());
    await this.updateCounter(-count);
    return count;
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
      // (has_many_association.rb:130).
      if (!this.reflection.isInverseUpdatesCounterCache?.()) {
        await this.updateCounter(-records.length);
      }
      return records.length;
    }
    // delete_all / nullify (Rails delete_records else-branch). Reached only via the
    // association-layer `delete` with a dependent strategy; non-through has_many
    // `delete` is intercepted by the CollectionProxy. Scope to the given records by
    // their query-constraint columns so we delete/nullify only those rows.
    // Rails: `reflection.klass.composite_query_constraints_list`
    // (has_many_association.rb:132). Both routes here go through
    // `record.association(name)` (instance-methods.ts:163-166, Rails
    // associations.rb:290-296), which constructs from the registered
    // reflection, so `reflection.klass` is always the rich reader.
    const queryConstraints = compositeQueryConstraintsList.call(this.reflection.klass as any);
    const values = records.map((r) =>
      queryConstraints.map((col) => (r as any)._readAttribute(col)),
    );
    const baseScope = (this as any).scope?.();
    if (!baseScope) return 0;
    // Rails: `scope = self.scope.where(query_constraints => values)`. A single-column
    // key takes the `WHERE id IN (...)` form; a composite key takes the tuple form
    // (OR-of-AND), since `AND col1 IN (...) AND col2 IN (...)` is a cartesian product.
    const scope =
      queryConstraints.length === 1
        ? baseScope.where({ [queryConstraints[0]]: values.map((tuple) => tuple[0]) })
        : baseScope.where(queryConstraints, values);
    // Canonical models map Rails' `dependent: :delete_all` to the `"delete"`
    // string (deleteAll is not yet in the AssociationOptions type), so normalize
    // it to the delete_all strategy here the same way `deleteAll()` does
    // (collection-association.ts). Without this the per-record delete path falls
    // through to nullify, which fails for NOT-NULL composite-PK foreign keys.
    method = method === "delete" ? "deleteAll" : method;
    const count = await this.deleteCount(method, scope);
    if (count > 0) await this.updateCounter(-count);
    return count;
  }

  /**
   * Mirrors: ActiveRecord::Associations::HasManyAssociation#concat_records
   * (has_many_association.rb:139-141) — `update_counter_if_success(super,
   * records.length)`.
   * @internal
   */
  protected override concatRecords(records: Base[], raise = false): Promise<Base[]> | Base[] {
    const concatenated = super.concatRecords(records, raise);
    return isThenable(concatenated)
      ? concatenated.then((saved) => this.updateCounterIfSuccess(saved, records.length))
      : this.updateCounterIfSuccess(concatenated, records.length);
  }

  /**
   * Mirrors: ActiveRecord::Associations::HasManyAssociation#_create_record
   * (has_many_association.rb:143-149). The Array arm delegates to plain
   * `super` — each recursion inside `CollectionAssociation#_createRecord`
   * re-enters here and bumps the counter once per element.
   * @internal
   */
  protected override async _createRecord(
    attributes?: Record<string, unknown> | Record<string, unknown>[],
    raise = false,
    block?: (record: Base) => void,
  ): Promise<Base | Base[] | null> {
    if (Array.isArray(attributes)) {
      return super._createRecord(attributes, raise, block);
    } else {
      return this.updateCounterIfSuccess(
        (await super._createRecord(attributes, raise, block)) as Base | null,
        1,
      );
    }
  }

  /**
   * Mirrors: ActiveRecord::Associations::HasManyAssociation#count_records
   * (has_many_association.rb:80-95).
   * @internal
   */
  async countRecords(): Promise<number> {
    const reflection = this.reflection as unknown as {
      hasActiveCachedCounter(): boolean;
      counterCacheColumn(): string | null;
    };
    let count: number;
    if (reflection.hasActiveCachedCounter()) {
      // has_active_cached_counter? guarantees a counter column, but guard
      // against a null column anyway — `nil.to_i == 0` in Rails.
      const column = reflection.counterCacheColumn();
      count = column == null ? 0 : toI((this.owner as any).readAttribute(column));
    } else {
      count = await (this as unknown as CollectionAssociation).scope().count("all");
    }

    // If there's nothing in the database, @target should only contain new
    // records or be an empty array. This is a documented side-effect of
    // the method that may avoid an extra SELECT.
    if (count === 0) {
      selectBang((this as unknown as CollectionAssociation).target, (record) =>
        record.isNewRecord(),
      );
      (this as unknown as CollectionAssociation).loadedBang();
    }

    const limitValue = (
      (this as unknown as CollectionAssociation).associationScope() as {
        limitValue?: number | null;
      } | null
    )?.limitValue;
    return limitValue == null ? count : Math.min(limitValue, count);
  }
}

/** Ruby `Object#to_i` semantics: nil → 0, leading-integer parse otherwise. */
function toI(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return Math.trunc(value);
  if (typeof value === "bigint") return Number(value);
  const n = Number.parseInt(String(value), 10);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Mirrors: `HasManyAssociation#update_counter(difference, reflection =
 * reflection())` (has_many_association.rb:98-102).
 * @internal
 */
async function updateCounter(
  this: HasManyAssociation,
  difference: number,
  reflection: AssociationDefinition = this.reflection,
): Promise<void> {
  if (!reflection.hasCachedCounter?.()) return;
  const counterCacheColumn = reflection.counterCacheColumn?.() as string;
  const owner = this.owner as any;
  if (typeof owner.incrementBang === "function") {
    await owner.incrementBang(counterCacheColumn, difference);
  } else if (typeof owner.updateCounters === "function") {
    await owner.updateCounters({ [counterCacheColumn]: difference });
  } else if (typeof owner.increment === "function") {
    owner.increment(counterCacheColumn, difference);
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
function updateCounterInMemory(this: HasManyAssociation, difference: number): void {
  const reflection = this.reflection;
  if (!reflection.isCounterMustBeUpdatedByHasMany?.()) return;
  const counter = reflection.counterCacheColumn?.() as string;
  const owner = this.owner as any;
  const current = Number(owner.readAttribute?.(counter) ?? 0);
  owner.writeAttribute?.(counter, current + difference);
  owner.clearAttributeChange?.(counter);
}

/**
 * Mirrors: `HasManyAssociation#delete_count(method, scope)`
 * (has_many_association.rb:112-118).
 * @internal
 */
function deleteCount(this: HasManyAssociation, method: string, scope: any): Promise<number> {
  // Rails: delete_all → scope.delete_all; nullify → scope.update_all(nullified_owner_attributes).
  if (method === "deleteAll") return scope.deleteAll?.() ?? Promise.resolve(0);
  const nullAttrs = (
    this as unknown as {
      computeNullifiedOwnerAttributes(): Record<string, null>;
    }
  ).computeNullifiedOwnerAttributes();
  return scope.updateAll?.(nullAttrs) ?? Promise.resolve(0);
}

/** @internal */
function updateCounterIfSuccess<T>(
  this: HasManyAssociation,
  savedSuccessfully: T,
  difference: number,
): T {
  if (savedSuccessfully) this.updateCounterInMemory(difference);
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
 * through-association loaders build an *ad-hoc* holder for a name/options pair
 * the model never declared that way; that triple shape is a trails-only
 * calling convention, not Rails surface, and it is module-private.
 *
 * `violatesStrictLoading` carries the result of the association's
 * `violates_strict_loading?` (association.rb:284-292) into this loader: Rails
 * raises on it as `find_target`'s first statement, but trails only knows a
 * query is actually needed after the cache/preload lookups below, which are
 * Rails' `find_target?` guard (association.rb:190). The predicate reads only
 * owner/reflection state, so evaluating it at the call site is the same answer.
 *
 * @internal
 */
async function findTarget(
  record: Base,
  assocName: string,
  assocDef: AssociationDefinition,
  queryExecutor?: () => Promise<Base[]>,
  violatesStrictLoading = false,
): Promise<Base[]> {
  const options = assocDef.options;
  if (options.through) {
    validateThroughReflection(record.constructor as typeof Base, assocName);
  }
  // Check cached (inverse_of) first, then preloaded — skip when a scope
  // override is provided (the scope has been mutated; the cache would return
  // stale/incorrect data for the diverged query).
  if (!queryExecutor) {
    // Honor an instance-cache hit (a directly-seeded or inverse-seeded
    // collection target), but ignore the association's *own* seat — its
    // collection proxy or the association object the proxy reads through:
    // its in-memory built/pushed records are not a complete collection and must
    // still be merged with a DB query (this loader runs inside that proxy's
    // load path, where `proxy.loaded` is false by construction).
    const cache = record._associationCache(assocName);
    if (
      cache &&
      cache !== record._collectionProxies.get(assocName) &&
      (cache as unknown) !== (record._associationInstances.get(assocName) as unknown) &&
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

  // `HasManyThroughAssociation#find_target` (has_many_through_association.rb
  // :225-229) returns `scope.to_a if disable_joins` BEFORE `super`, so that
  // route never reaches the base body's strict-loading raise. The scope-override
  // executor below still wins, as it did when this branch sat under it.
  const reflEarly =
    options.through && !queryExecutor
      ? (record.constructor as typeof Base)._reflectOnAssociation?.(assocName)
      : undefined;
  if (reflEarly && _canRouteThroughViaDisableJoinsAssociationScope(reflEarly, options)) {
    return _loadThroughViaDisableJoinsScope(record, reflEarly, options);
  }

  // `Association#find_target`'s first statement (association.rb:248-250). Gated
  // by `find_target?`: a new-record owner without the FK present never reaches
  // `find_target` and so never raises.
  if (violatesStrictLoading && _findTargetReachable(record, assocName, options, "foreign")) {
    const ctor = record.constructor as typeof Base;
    const reflection = ctor._reflectOnAssociation?.(assocName);
    if (!reflection) throw new AssociationNotFoundError(record, assocName);
    strictLoadingViolationBang({ owner: ctor, reflection });
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
    const reflThrough = ctorEarly._reflectOnAssociation?.(assocName);
    // Nested-through shapes flatten their whole `reflection.chain` into the
    // JOIN-based AssociationScope path below, sharing its inverse-wiring and
    // null-FK short-circuit. An unsaved owner resolves its through step from
    // the in-memory association target (e.g. `post.author = mary` before save),
    // which the SQL JOIN cannot see — `_routeThroughViaAssociationScope` keeps
    // those on the 2-step loader.
    if (!_routeThroughViaAssociationScope(record, reflThrough, options)) {
      const { _buildAssociationInstance } = await import("./instance-methods.js");
      const through = _buildAssociationInstance.call(record, {
        name: assocName,
        type: "hasMany",
        scope: assocDef.scope,
        options,
      }) as unknown as { loadHasManyThrough(): Promise<Base[]> };
      return through.loadHasManyThrough();
    }
    // Fall through into the AssociationScope path below.
  }

  const ctor = record.constructor as typeof Base;
  if (options.inverseOf) {
    const className = options.className ?? camelize(singularize(assocName));
    validateInverseOf(
      ctor,
      resolveAssocClass(record, assocName, className),
      assocName,
      options.inverseOf,
    );
  }

  const rel = scope(record, assocName, assocDef);
  if (rel === null) return [];

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

/**
 * Build the has_many association's relation without executing it.
 *
 * Mirrors: ActiveRecord::Associations::Association#scope (association.rb:107) —
 * `target_scope.merge!(association_scope)`, where `association_scope` is
 * `AssociationScope.scope(self)`. `findTarget` runs this relation rather than
 * rebuilding it, and the non-executing callers (CollectionProxy's seed and
 * `scope()`) reach the same relation through here.
 *
 * Returns null when the owner-side key values are absent (unsaved owner / null
 * PK), which Rails expresses as the NullRelation fallback.
 *
 * Takes the owner/name/options triple rather than an association instance for
 * the same reason `findTarget` does — the CollectionProxy and the
 * through-association loaders reach it without one.
 *
 * @internal
 */
export function scope(
  record: Base,
  assocName: string,
  assocDef: AssociationDefinition,
): any | null {
  const options = assocDef.options;
  const ctor = record.constructor as typeof Base;
  const className = options.className ?? camelize(singularize(assocName));
  const primaryKey = options.primaryKey ?? ctor.primaryKey;

  const targetModel = resolveAssocClass(record, assocName, className);

  const foreignKeyColumns = ownerForeignKeyColumns(ctor, assocName, options);
  const foreignKey: string | string[] =
    foreignKeyColumns.length === 1 ? foreignKeyColumns[0] : foreignKeyColumns;

  // Route through AssociationScope when we have a reflection registered.
  // AssociationScope handles scalar, composite, polymorphic `:as`, and
  // STI in a single path matching Rails' `AssociationScope.scope`.
  // Inline fallback only when the reflection hasn't been registered
  // (happens in tests that define associations via the lower-level API
  // without going through Reflection.create).
  const reflection = ctor._reflectOnAssociation?.(assocName);
  if (options.through && !reflection) return null;

  // Rails validates composite-key shape at exactly one site,
  // `AssociationReflection#check_validity!` (reflection.rb:618), and that check
  // opens with `!polymorphic? && ...` — a polymorphic reflection is never
  // shape-checked at all, whatever its FK/PK lengths. `checkValidityBang`
  // (reflection.ts) already ports that faithfully, so a reflection-backed `:as`
  // association must reach AssociationScope unguarded. The guards below are the
  // inline fallback's alone: with no reflection there is no canonical check to
  // consult, and an unzippable FK/PK pairing would otherwise read
  // `readAttribute(undefined)` into broken SQL. That fallback-only strictness is
  // a trails limitation, not Rails behavior.
  if (options.as && !reflection) {
    if (Array.isArray(foreignKey)) {
      routeThroughCheckValidity(ctor, assocName);
      throw new CompositePrimaryKeyMismatchError({
        activeRecord: ctor.name,
        name: assocName,
        primaryKey,
        foreignKey,
      });
    }
    if (Array.isArray(primaryKey) && !primaryKey.includes("id")) {
      routeThroughCheckValidity(ctor, assocName);
      throw new CompositePrimaryKeyMismatchError({
        activeRecord: ctor.name,
        name: assocName,
        primaryKey,
        foreignKey,
      });
    }
  }
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
    if (v === null || v === undefined) return null;
  }

  let rel: any;
  if (reflection) {
    // Rails' `Association#scope` is
    //   AssociationRelation.create(klass, self).merge!(klass.scope_for_association)
    // (association.rb:313), so the unscoped+constraints relation MUST
    // be merged with `klass.scope_for_association` — otherwise default_scope
    // / scope extensions silently disappear. AssociationScope.scope
    // already merges `reflection.scope` (macro-time lambda) via scopeFor;
    // skip re-applying the definition's scope ONLY when it's that exact same
    // function. Callers like `loadHasManyThrough` synthesize a NEW
    // scope (wrapping with `sourceType` filtering) — those
    // must still run.
    const built = _builtAssociationScope(record, assocName, reflection, targetModel);
    const baseRelation = _scopeForAssociation(targetModel);
    rel = baseRelation.merge(built);
    rel = applyAssociationScope(rel, assocDef.scope, record, reflection.scope);
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
      const conditions: Record<string, unknown> = { [typeCol]: ctor.polymorphicName() };
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
    rel = applyAssociationScope(rel, assocDef.scope, record);
  }
  return rel;
}

Object.assign(HasManyAssociation.prototype, {
  updateCounterInMemory,
  updateCounterIfSuccess,
  updateCounter,
  deleteCount,
});
