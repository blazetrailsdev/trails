import type { Base } from "./base.js";
import { Relation } from "./relation.js";
import type { CollectionProxy } from "./associations/collection-proxy.js";
import { _setAssociationRelationCtor } from "./associations/collection-proxy.js";
import type { Association } from "./associations/association.js";
import { setAssociationRelationFactory } from "./associations/_scope-slots.js";
import { _cacheSingularTarget } from "./associations.js";
import { _registerRelationFamily } from "./relation/uncacheable-methods-slot.js";
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
  /**
   * @internal The owning association. CollectionProxy-backed when created
   * via the collection proxy (the normal user-facing path); Association-backed
   * when created by `Association#targetScope()` for internal scope merging
   * (mirrors Rails' `AssociationRelation.create(klass, self)` in `target_scope`).
   */
  _association: CollectionProxy<T> | Association;

  constructor(modelClass: typeof Base, association: CollectionProxy<T> | Association) {
    super(modelClass);
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
   * Preserve the AssociationRelation subclass across `_clone()` so chains
   * like `blog.posts.where(...).order(...).create(...)` still route writes
   * through the association.
   */
  protected _newRelation(): Relation<T> {
    return new AssociationRelation<T>(this.model, this._association);
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
    const records = await this.limit(1).toArray();
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
    const proxy = this._association as CollectionProxy<T> & { _pendingThroughScope?: unknown };
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
   * Array-style equality — compares against the relation's loaded records.
   * Mirrors Rails' `AssociationRelation#==(other)`, which is defined as
   * `other == records` so that `blog.posts == [p1, p2]` works in user code.
   *
   * TypeScript can't overload `==` / `===`, so this is surfaced as an
   * explicit `equals` method.
   */
  async equals(other: Relation<T> | T[]): Promise<boolean> {
    const ours = await this.toArray();
    const theirs = Array.isArray(other) ? other : await other.toArray();
    if (ours.length !== theirs.length) return false;
    for (let i = 0; i < ours.length; i++) {
      if (!ours[i].isEqual(theirs[i])) return false;
    }
    return true;
  }

  /**
   * Override the load path to propagate inverse_of / per-record
   * strict-loading onto the fetched
   * records — mirrors Rails' `AssociationRelation#exec_queries`, which
   * calls `set_inverse_instance_from_queries` and `set_strict_loading`,
   * propagating the owner's strict-loading mode onto each record.
   * Without the inverse wiring, a record loaded via
   * `blog.posts.where(...)` wouldn't cache `post.blog = blog` on the
   * way back, so accessing the inverse would re-query.
   */
  async toArray(): Promise<T[]> {
    const owner = this._association.owner;
    const reflection = this._association.reflection;
    // Resolve the inverse association name via the registered Reflection,
    // so automatic inverse_of (no explicit option) wires the parent onto
    // each loaded child — mirrors `set_inverse_instance_from_queries`.
    const ownerCtor = owner.constructor as typeof import("./base.js").Base;
    const resolvedRefl = ownerCtor._reflectOnAssociation?.(reflection.name);
    const inverseName: string | null =
      resolvedRefl?.inverseName?.() ??
      (reflection.options.inverseOf && !reflection.options.polymorphic
        ? reflection.options.inverseOf
        : null);

    // Inverse wiring: mirrors Association#inversable? — only wire when the
    // child's FK actually points at the owner. Chained queries that widen the
    // scope (`.or(other.collection)`, `.unscope(:where)`) can return rows that
    // belong to a *different* owner; wiring those would alias the wrong parent
    // onto the child. The FK→PK comparison lives in
    // `Association#matchesForeignKey` (Rails `matches_foreign_key?`).
    const ownerRec = owner as unknown as { isPersisted?: () => boolean };
    const ownerPersisted = ownerRec.isPersisted?.() ?? true;

    // Rails' `AssociationRelation#exec_queries` yields a single per-record block
    // that runs `set_inverse_instance_from_queries` AND `set_strict_loading`,
    // both BEFORE `preload_associations` (association_relation.rb:43-49,
    // relation.rb:1413-1414). We mirror that single block here. Wiring the
    // inverse after the load (the old behavior) would overwrite a nested
    // preload: e.g. `author.posts.includes(author: :first_posts)` preloads
    // `first_posts` onto a freshly-loaded author, then a post-load inverse pass
    // would replace `post.author` with the bare owner, losing the preloaded
    // `first_posts`. Wiring first makes the preloader see `post.author` already
    // loaded (the owner) and populate `first_posts` on that same record.
    //
    // Resolve the OO association off the owner (NOT `this._association`, which
    // is the JS-Proxy-wrapped CollectionProxy whose unknown-property trap raises
    // a strict-loading violation) so the n+1-only-vs-mode logic stays in one
    // place. `set_strict_loading` runs for EVERY record unconditionally — it
    // propagates the owner's mode (which may be "off") onto each child.
    const ownerAssoc = (
      owner as unknown as {
        association?: (name: string) => {
          setStrictLoading?: (record: unknown) => unknown;
          matchesForeignKey?: (record: unknown) => boolean;
        };
      }
    ).association?.(reflection.name);
    const strictLoad =
      ownerAssoc && typeof ownerAssoc.setStrictLoading === "function"
        ? ownerAssoc.setStrictLoading.bind(ownerAssoc)
        : null;

    // Restore the prior block after the load rather than leaving the wrapper in
    // place: a later `reload()` / repeated `toArray()` on the same relation must
    // not re-wrap and re-run the wiring N times.
    const prevBlock = this._instantiateBlock;
    if (inverseName || strictLoad) {
      this._instantiateBlock = (record: T): void => {
        if (prevBlock) prevBlock(record);
        if (inverseName) {
          const childRec = record as unknown as { isPersisted?: () => boolean };
          const childPersisted = childRec.isPersisted?.() ?? true;
          // Mirrors `Association#inversable?`: wire when either side is unsaved,
          // else fall to the (now base-resident) `matches_foreign_key?` check.
          // The FK-match logic lives in `Association#matchesForeignKey`; the AR
          // wiring stays separate only to route the cache through
          // `_cacheSingularTarget` (which flags `_explicitTarget`, unlike the
          // base `inversedFromQueries` path).
          const inversable =
            !ownerPersisted || !childPersisted || (ownerAssoc?.matchesForeignKey?.(record) ?? true);
          if (inversable) _cacheSingularTarget(record as Base, inverseName, owner);
        }
        if (strictLoad) strictLoad(record);
      };
    }

    try {
      return await super.toArray();
    } finally {
      this._instantiateBlock = prevBlock;
    }
  }
}

_setAssociationRelationCtor(AssociationRelation);
_registerRelationFamily(
  "associationRelation",
  AssociationRelation as unknown as new (...a: never[]) => unknown,
);
setAssociationRelationFactory(
  (klass, assoc) => new AssociationRelation(klass as typeof Base, assoc as Association),
);
