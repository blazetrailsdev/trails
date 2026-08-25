import type { Base } from "./base.js";
import { Relation } from "./relation.js";
import type { CollectionProxy } from "./associations/collection-proxy.js";
import type { Association } from "./associations/association.js";
import { setAssociationRelationFactory } from "./associations/_scope-slots.js";
import { _registerRelationFamily } from "./relation/uncacheable-methods-slot.js";
import { associationRelationClassFor, wrapWithScopeProxy } from "./relation/delegation.js";
import { rebaseNewOwnerSeed } from "./associations/new-owner-seed-rebase.js";
import { ArgumentError } from "@blazetrails/activemodel";

/**
 * A Relation produced by a collection association (e.g. `blog.posts`,
 * `blog.posts.where(...)`). Inherits from Relation so chain methods and
 * finders work unchanged, but routes writes (`build`, `create`, `create!`)
 * through the owning association so the foreign key, inverse, and loaded
 * target are wired up — matching `blog.posts.create(...)` in Rails.
 *
 * Mirrors: ActiveRecord::AssociationRelation
 */
export class AssociationRelation<T extends Base> extends Relation<T> {
  /** @internal */
  static override _railsClassName = "ActiveRecord::AssociationRelation";

  /**
   * @internal The owning association. CollectionProxy-backed when created
   * via the collection proxy (the normal user-facing path); Association-backed
   * when created by `Association#targetScope()` for internal scope merging
   * (mirrors Rails' `AssociationRelation.create(klass, self)` in `target_scope`).
   */
  _association: CollectionProxy<T> | Association;

  constructor(klass: typeof Base, association: CollectionProxy<T> | Association) {
    super(klass);
    this._association = association;
  }

  /**
   * Public accessor for the owning association. Mirrors Rails'
   * `ActiveRecord::AssociationRelation#proxy_association`, which extension
   * blocks use to reach the owner (`proxy_association.owner`) and the
   * reflection (`proxy_association.reflection`).
   *
   * Returns `CollectionProxy<T>` for user-facing association relations;
   * returns the plain `Association` instance when this relation was built
   * by `Association#targetScope()` for internal scope merging.
   */
  get proxyAssociation(): Association {
    // Rails' `@association` is always the `Association` itself; trails' seat
    // holds the owner's `CollectionProxy` on the user-facing path, so unwrap it
    // here — `Association#scope`'s
    // `klass.current_scope.proxy_association == self` branch
    // (association.rb:110) compares against the association.
    const association = this._association as CollectionProxy<T> & {
      proxyAssociation?: Association;
    };
    return association.proxyAssociation ?? (this._association as Association);
  }

  /**
   * Preserve the AssociationRelation subclass across `clone()` — Ruby's
   * `Object#clone` allocates the receiver's own class — so chains like
   * `blog.posts.where(...).order(...).create(...)` still route writes through
   * the association.
   *
   * @internal
   */
  override clone(): Relation<T> {
    const Ctor = associationRelationClassFor(this.model);
    const rel = new Ctor(this.model, this._association) as Relation<T>;
    rel.initializeCopy(this);
    return wrapWithScopeProxy(rel);
  }

  /**
   * The none-short-circuit chokepoint (see `Relation#isNullRelation`): every
   * query terminal (`toArray`/`exists`/`pluck`/`count`/the bounded finders) and
   * the mutation terminals (`updateAll`/`deleteAll`, plus `touchAll`/
   * `updateCounters` via their `updateAll` delegation) consult this before
   * returning an empty result, so rebasing a stale new-owner `1=0` seed here
   * covers all of them from one place. Reports the (possibly rebased)
   * `_isNone`.
   */
  override isNullRelation(): boolean {
    this._maybeRebaseAssociationSeed();
    return super.isNullRelation();
  }

  /**
   * @internal Rebase a relation spawned off a stale new-owner `1=0` seed onto
   * the live association scope once the owner is saved and its FK resolves.
   * No-op unless this relation still carries the seed and the rebuilt scope
   * resolves a real FK. Clears the seed marker after a successful rebase so it
   * runs exactly once — a second pass would re-merge the resolved scope onto an
   * already-rebased relation (duplicate joins/predicates).
   */
  _maybeRebaseAssociationSeed(): void {
    if (!this._seededNoneNewOwner) return;
    const assoc = this._association as unknown as {
      scope?: () => { _isNone: boolean };
      resetScope?: () => void;
    };
    if (typeof assoc.scope !== "function") return;
    // Clear the marker BEFORE rebuilding: the rebuild runs the merger, which
    // itself consults `isNullRelation()` (merger.rb:70), and that would re-enter
    // this hook. Restored below if the rebuilt scope is still unresolved, so a
    // later call retries.
    this._seededNoneNewOwner = false;
    // The association memoized its `@association_scope` while the owner was
    // still new (that memo is what seeded this relation), so it carries the
    // unresolved FK too — drop it before rebuilding, exactly as Rails'
    // `reset_scope` does (association.rb:119-121).
    assoc.resetScope?.();
    const fresh = assoc.scope();
    if (fresh._isNone) {
      this._seededNoneNewOwner = true;
      return;
    }
    rebaseNewOwnerSeed(
      this as unknown as Parameters<typeof rebaseNewOwnerSeed>[0],
      fresh as unknown,
      this._seedWherePredicates,
    );
  }

  /**
   * Find the first record matching the current scope, or build one (unsaved).
   * Routes build through the association so the FK and polymorphic type are
   * set even when the owner is unsaved (no FK in the where clause).
   *
   * Mirrors: ActiveRecord::AssociationRelation#first_or_initialize
   */
  async firstOrInitialize(extra?: Record<string, unknown>): Promise<T> {
    const records = await this.limit(1);
    if (records.length > 0) return records[0];
    return this.build(extra ?? {});
  }

  /**
   * Mirrors: ActiveRecord::AssociationRelation#_new (association_relation.rb:31-33).
   * The `scoping {}` wrap lives in `Relation#build` (relation.rb:125-132), so
   * `Association#scope` sees this relation as the current scope while the
   * record is built.
   */
  protected override _new(attributes: Record<string, unknown>): T {
    return (this._association as CollectionProxy<T>).build(attributes);
  }

  /**
   * Mirrors: ActiveRecord::AssociationRelation#_create (association_relation.rb:35-37).
   */
  protected override _create(
    attributes: Record<string, unknown>,
    block?: (record: T) => void,
  ): Promise<T> {
    return (this._association as CollectionProxy<T>).create(attributes, block);
  }

  /**
   * Mirrors: ActiveRecord::AssociationRelation#_create! (association_relation.rb:39-41).
   */
  protected override _createBang(
    attributes: Record<string, unknown>,
    block?: (record: T) => void,
  ): Promise<T> {
    return (this._association as CollectionProxy<T>).createBang(attributes, block);
  }

  /**
   * Bulk insert/upsert through a chained association relation
   * (`book.subscribers.where(...).insert_all`). Mirrors Rails'
   * `AssociationRelation`, which guards `insert`, `insert_all`, `insert!`,
   * `insert_all!`, `upsert`, and `upsert_all`: a `has_many :through`
   * association raises ArgumentError. Non-through associations fall through
   * to the inherited Relation implementation. (The un-chained
   * `CollectionProxy` carries the same guard.)
   */
  private _assertBulkInsertable(): void {
    if (this._association.reflection.options?.through) {
      throw new ArgumentError(
        "Bulk insert or upsert is currently not supported for has_many through association",
      );
    }
  }

  async insert(...args: Parameters<Relation<T>["insert"]>): ReturnType<Relation<T>["insert"]> {
    this._assertBulkInsertable();
    return super.insert(...args);
  }

  async insertBang(
    ...args: Parameters<Relation<T>["insertBang"]>
  ): ReturnType<Relation<T>["insertBang"]> {
    this._assertBulkInsertable();
    return super.insertBang(...args);
  }

  async insertAll(
    ...args: Parameters<Relation<T>["insertAll"]>
  ): ReturnType<Relation<T>["insertAll"]> {
    this._assertBulkInsertable();
    return super.insertAll(...args);
  }

  async insertAllBang(
    ...args: Parameters<Relation<T>["insertAllBang"]>
  ): ReturnType<Relation<T>["insertAllBang"]> {
    this._assertBulkInsertable();
    return super.insertAllBang(...args);
  }

  async upsert(...args: Parameters<Relation<T>["upsert"]>): ReturnType<Relation<T>["upsert"]> {
    this._assertBulkInsertable();
    return super.upsert(...args);
  }

  async upsertAll(
    ...args: Parameters<Relation<T>["upsertAll"]>
  ): ReturnType<Relation<T>["upsertAll"]> {
    this._assertBulkInsertable();
    return super.upsertAll(...args);
  }

  /**
   * Mirrors `AssociationRelation#==` (association_relation.rb:14-16), which is
   * `other == records` — the comparison semantics come from `other`'s own
   * `==`, so an Array compares element-wise and a Relation runs
   * `Relation#==` (relation.rb:1253-1262), which compares `to_sql`.
   *
   * TypeScript can't overload `==` / `===`, so this is surfaced as an
   * explicit `equals` method.
   */
  override async equals(other: unknown): Promise<boolean | undefined> {
    const records = await this.records();
    if (Array.isArray(other)) {
      return (
        other.length === records.length && other.every((record: T, i) => record.equals(records[i]))
      );
    }
    const otherEquals = (other as { equals?: (o: unknown) => unknown } | null)?.equals;
    if (typeof otherEquals === "function") {
      return (await otherEquals.call(other, records)) as boolean | undefined;
    }
    return false;
  }

  /**
   * Mirrors: ActiveRecord::AssociationRelation#exec_queries
   * (association_relation.rb:43-49) — `super` with a per-record block that runs
   * `set_inverse_instance_from_queries` and `set_strict_loading`, both before
   * `preload_associations` (relation.rb:1413-1414) and only then `yield`s to the
   * caller's block (association_relation.rb:47). trails' per-record seam is
   * `_instantiateBlock`, so the block already there is that `yield` and runs
   * last; it is restored afterwards so a later `reload()` does not re-wrap it.
   *
   * `@association` is reached through the owner rather than off
   * `this._association`, which is the JS-Proxy-wrapped CollectionProxy whose
   * unknown-property trap raises a strict-loading violation.
   */
  protected override async execQueries(): Promise<T[]> {
    const association = this._association.owner.association(this._association.reflection.name);
    const prevBlock = this._instantiateBlock;
    this._instantiateBlock = (record: T): void => {
      association.setInverseInstanceFromQueries(record);
      association.setStrictLoading(record);
      if (prevBlock) prevBlock(record);
    };

    try {
      return await super.execQueries();
    } finally {
      this._instantiateBlock = prevBlock;
    }
  }
}

_registerRelationFamily(
  "associationRelation",
  AssociationRelation as unknown as new (...a: never[]) => unknown,
);
setAssociationRelationFactory((klass, assoc) => {
  const Ctor = associationRelationClassFor(klass as typeof Base);
  // Rails' `AssociationRelation.create` yields a relation that answers the
  // model's named scopes and association extensions through `method_missing`
  // (relation/delegation.rb). trails supplies that with the scope proxy, which
  // `spawn` also applies — so wrap here, or a `merge!`-based `target_scope`
  // (which does not spawn) would hand back a relation without them.
  return wrapWithScopeProxy(new Ctor(klass as typeof Base, assoc as Association));
});
