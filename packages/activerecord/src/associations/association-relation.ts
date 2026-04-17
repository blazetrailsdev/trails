import type { Base } from "../base.js";
import { Relation } from "../relation.js";
import type { CollectionProxy } from "./collection-proxy.js";
import { _setAssociationRelationCtor } from "./collection-proxy.js";

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
  /** @internal The owning collection association. */
  _association: CollectionProxy<T>;

  constructor(modelClass: typeof Base, association: CollectionProxy<T>) {
    super(modelClass);
    this._association = association;
  }

  /**
   * Public accessor for the owning association. Mirrors Rails'
   * `ActiveRecord::AssociationRelation#proxy_association`, which extension
   * blocks use to reach the owner (`proxy_association.owner`) and the
   * reflection (`proxy_association.reflection`).
   */
  get proxyAssociation(): CollectionProxy<T> {
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
  build(attrs: Record<string, unknown> = {}): T {
    const merged = { ...this._scopeAttributes(), ...attrs };
    return this._association.build(merged) as T;
  }

  /**
   * Build and persist an associated record through the owning association.
   *
   * Mirrors: ActiveRecord::AssociationRelation#_create / #create
   */
  async create(attrs: Record<string, unknown> = {}): Promise<T> {
    const merged = { ...this._scopeAttributes(), ...attrs };
    return this._association.create(merged) as Promise<T>;
  }

  /**
   * Build and persist an associated record, raising on validation failure.
   * Delegates to `CollectionProxy#createBang`, which throws `RecordInvalid`
   * directly so FK + loaded-target wiring stay in sync with the non-bang
   * path.
   *
   * Mirrors: ActiveRecord::AssociationRelation#_create! / #create!
   */
  async createBang(attrs: Record<string, unknown> = {}): Promise<T> {
    const merged = { ...this._scopeAttributes(), ...attrs };
    return this._association.createBang(merged) as Promise<T>;
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
   * Override the load path to propagate inverse_of and strict_loading onto
   * records fetched through this relation — mirrors Rails'
   * `AssociationRelation#exec_queries`, which calls
   * `set_inverse_instance_from_queries` and applies `strict_loading!` when
   * the owner or the reflection has it set. Without this, a record loaded
   * via `blog.posts.where(...)` wouldn't cache `post.blog = blog` on the
   * way back, so accessing the inverse would re-query.
   */
  async toArray(): Promise<T[]> {
    const records = await super.toArray();
    const owner = this._association.owner;
    const reflection = this._association.reflection;
    const inverseOf = reflection.options.inverseOf;

    if (inverseOf && !reflection.options.polymorphic) {
      for (const r of records) {
        const cache = ((r as any)._cachedAssociations ??= new Map());
        cache.set(inverseOf, owner);
      }
    }

    const ownerAny = owner as unknown as {
      _strictLoading?: boolean;
      isStrictLoadingNPlusOneOnly?: () => boolean;
    };
    const nPlusOneOnly =
      typeof ownerAny.isStrictLoadingNPlusOneOnly === "function" &&
      ownerAny.isStrictLoadingNPlusOneOnly() &&
      reflection.type === "hasMany";
    if (nPlusOneOnly || ownerAny._strictLoading || reflection.options.strictLoading) {
      for (const r of records) {
        (r as unknown as { strictLoadingBang?: () => void }).strictLoadingBang?.();
      }
    }

    return records;
  }
}

_setAssociationRelationCtor(AssociationRelation);
