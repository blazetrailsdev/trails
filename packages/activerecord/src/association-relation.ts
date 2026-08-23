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
  get proxyAssociation(): CollectionProxy<T> | Association {
    return this._association;
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
   * Build an unsaved associated record. Merges the relation's scope
   * attributes (e.g. `where(title: "X")` → `{ title: "X" }`) with the
   * caller's attrs, then delegates to the association so the FK (and, for
   * polymorphic, the `*_type`) is set and the record is pushed onto the
   * loaded target.
   *
   * Mirrors: ActiveRecord::AssociationRelation#_new / #build
   */
  build(attrs: Record<string, unknown>[], block?: (r: T) => void): T[];
  build(attrs?: Record<string, unknown>, block?: (r: T) => void): T;
  build(
    attrs: Record<string, unknown> | Record<string, unknown>[] = {},
    block?: (r: T) => void,
  ): T | T[] {
    if (Array.isArray(attrs)) {
      return attrs.map((a) => this.build(a, block));
    }
    const merged = { ...this.scopeForCreate(), ...attrs };
    return (this._association as CollectionProxy<T>).build(merged, block);
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
   * Build and persist an associated record through the owning association.
   *
   * Mirrors: ActiveRecord::AssociationRelation#_create / #create
   */
  async create(attrs: Record<string, unknown>[], block?: (r: T) => void): Promise<T[]>;
  async create(attrs?: Record<string, unknown>, block?: (r: T) => void): Promise<T>;
  async create(
    attrs: Record<string, unknown> | Record<string, unknown>[] = {},
    block?: (r: T) => void,
  ): Promise<T | T[]> {
    if (Array.isArray(attrs)) {
      const records: T[] = [];
      for (const a of attrs) records.push(await this.create(a, block));
      return records;
    }
    const merged = { ...this.scopeForCreate(), ...attrs };
    // `_association` is the owner's `CollectionProxy` when this relation was
    // spawned off the proxy, and the OO association when it came from
    // `Association#scope` (the `delegate(*QueryMethods, to: :scope)` path,
    // collection_proxy.rb:1128-1137). `HasManyThroughAssociation#build_record`
    // reads the in-flight scope back off the owner's cached proxy, so resolve
    // that proxy here rather than stamping the association object.
    const assoc = this._association as unknown as {
      owner?: { _collectionProxies?: Map<string, unknown> };
      reflection?: { name: string };
    };
    const proxy = (assoc.owner?._collectionProxies?.get(assoc.reflection?.name ?? "") ??
      this._association) as CollectionProxy<T> & { _pendingThroughScope?: unknown };
    const prev = proxy._pendingThroughScope;
    proxy._pendingThroughScope = this;
    try {
      return await proxy.create(merged, block);
    } finally {
      proxy._pendingThroughScope = prev;
    }
  }

  /**
   * Build and persist an associated record, raising on validation failure.
   * Delegates to `CollectionProxy#createBang`, which throws `RecordInvalid`
   * directly so FK + loaded-target wiring stay in sync with the non-bang
   * path.
   *
   * Mirrors: ActiveRecord::AssociationRelation#_create! / #create!
   */
  async createBang(attrs: Record<string, unknown>[], block?: (r: T) => void): Promise<T[]>;
  async createBang(attrs?: Record<string, unknown>, block?: (r: T) => void): Promise<T>;
  async createBang(
    attrs: Record<string, unknown> | Record<string, unknown>[] = {},
    block?: (r: T) => void,
  ): Promise<T | T[]> {
    if (Array.isArray(attrs)) {
      const records: T[] = [];
      for (const a of attrs) records.push(await this.createBang(a, block));
      return records;
    }
    const merged = { ...this.scopeForCreate(), ...attrs };
    return (this._association as CollectionProxy<T>).createBang(merged, block);
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
