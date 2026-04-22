import type { Base } from "./base.js";
import { Relation } from "./relation.js";
import type { CollectionProxy } from "./associations/collection-proxy.js";
import { _setAssociationRelationCtor } from "./associations/collection-proxy.js";
import { StrictLoadingViolationError } from "./errors.js";

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
    return this._association.build(merged, block) as T;
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
      for (const a of attrs) records.push((await this.create(a, block)) as T);
      return records;
    }
    const merged = { ...this.scopeForCreate(), ...attrs };
    return this._association.create(merged, block) as Promise<T>;
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
      for (const a of attrs) records.push((await this.createBang(a, block)) as T);
      return records;
    }
    const merged = { ...this.scopeForCreate(), ...attrs };
    return this._association.createBang(merged, block) as Promise<T>;
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
   * Throw `StrictLoadingViolationError` if the owning record has
   * strict-loading on and isn't inside a bypass block. Called from
   * every AR query-executing entry point (toArray, count, pluck,
   * pick, calculate, updateAll, deleteAll). Centralized here because
   * with `CP extends Relation`, chained queries (blog.posts.where
   * (...)) bypass the old `wrapCollectionProxy` `get` trap that used
   * to enforce this.
   */
  private _checkStrictLoading(): void {
    const owner = this._association.owner;
    const ownerAny = owner as unknown as {
      _strictLoading?: boolean;
      _strictLoadingBypassCount?: number;
    };
    if (ownerAny._strictLoading && !ownerAny._strictLoadingBypassCount) {
      throw StrictLoadingViolationError.forAssociation(owner, this._association.associationName);
    }
  }

  /**
   * Override the load path to enforce owner strict-loading and to
   * propagate inverse_of / per-record strict-loading onto the fetched
   * records — mirrors Rails' `AssociationRelation#exec_queries`, which
   * calls `set_inverse_instance_from_queries` and applies
   * `strict_loading!` when the owner or the reflection has it set.
   * Without the inverse wiring, a record loaded via
   * `blog.posts.where(...)` wouldn't cache `post.blog = blog` on the
   * way back, so accessing the inverse would re-query.
   */
  async toArray(): Promise<T[]> {
    this._checkStrictLoading();
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

    const ownerFlags = owner as unknown as {
      _strictLoading?: boolean;
      isStrictLoadingNPlusOneOnly?: () => boolean;
    };
    const nPlusOneOnly =
      typeof ownerFlags.isStrictLoadingNPlusOneOnly === "function" &&
      ownerFlags.isStrictLoadingNPlusOneOnly() &&
      reflection.type === "hasMany";
    if (nPlusOneOnly || ownerFlags._strictLoading || reflection.options.strictLoading) {
      for (const r of records) {
        (r as unknown as { strictLoadingBang?: () => void }).strictLoadingBang?.();
      }
    }

    return records;
  }

  // Other SQL-executing entry points — gate on the same strict-loading
  // check. Rails enforces strict loading uniformly across `CollectionProxy`
  // reads; with CP now extending Relation, chained AR methods need the
  // same gate.

  // @ts-expect-error — Relation defines `count` as a property; override
  //   as a method so we can gate strict-loading before dispatching.
  async count(column?: string): Promise<number | Record<string, number>> {
    this._checkStrictLoading();
    return (
      Relation.prototype as unknown as {
        count: (col?: string) => Promise<number | Record<string, number>>;
      }
    ).count.call(this, column);
  }

  // @ts-expect-error — sum/average/minimum/maximum are also property-
  //   assigned on Relation (from the Calculations mixin); override as
  //   methods to gate strict-loading before each SQL entry point.
  async sum(column?: string): Promise<number | Record<string, number>> {
    this._checkStrictLoading();
    return (
      Relation.prototype as unknown as {
        sum: (col?: string) => Promise<number | Record<string, number>>;
      }
    ).sum.call(this, column);
  }

  // @ts-expect-error — see `sum`.
  async average(column: string): Promise<number | null | Record<string, number>> {
    this._checkStrictLoading();
    return (
      Relation.prototype as unknown as {
        average: (col: string) => Promise<number | null | Record<string, number>>;
      }
    ).average.call(this, column);
  }

  // @ts-expect-error — see `sum`.
  async minimum(column: string): Promise<unknown | null | Record<string, unknown>> {
    this._checkStrictLoading();
    return (
      Relation.prototype as unknown as {
        minimum: (col: string) => Promise<unknown | null | Record<string, unknown>>;
      }
    ).minimum.call(this, column);
  }

  // @ts-expect-error — see `sum`.
  async maximum(column: string): Promise<unknown | null | Record<string, unknown>> {
    this._checkStrictLoading();
    return (
      Relation.prototype as unknown as {
        maximum: (col: string) => Promise<unknown | null | Record<string, unknown>>;
      }
    ).maximum.call(this, column);
  }

  override pluck(...columns: Parameters<Relation<T>["pluck"]>): Promise<unknown[]> {
    this._checkStrictLoading();
    return super.pluck(...columns);
  }

  override pick(...columns: Parameters<Relation<T>["pick"]>): Promise<unknown> {
    this._checkStrictLoading();
    return super.pick(...columns);
  }

  override async calculate(
    operation: "count" | "sum" | "average" | "minimum" | "maximum",
    column?: string,
  ): Promise<number | Record<string, number>> {
    this._checkStrictLoading();
    return (
      super.calculate as unknown as (
        op: string,
        col?: string,
      ) => Promise<number | Record<string, number>>
    ).call(this, operation, column);
  }

  override updateAll(updates: Record<string, unknown>): Promise<number> {
    this._checkStrictLoading();
    return super.updateAll(updates);
  }

  override deleteAll(): Promise<number> {
    this._checkStrictLoading();
    return super.deleteAll();
  }
}

_setAssociationRelationCtor(AssociationRelation);
