import type { Base } from "./base.js";
import { Relation } from "./relation.js";
import type { CollectionProxy } from "./associations/collection-proxy.js";
import { _setAssociationRelationCtor } from "./associations/collection-proxy.js";

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
    const records = await super.toArray();
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
        ? (reflection.options.inverseOf as string)
        : null);

    if (inverseName) {
      // Mirrors Association#inversable?: only wire when the child's FK
      // actually points at the owner. Chained queries that widen the
      // scope (`.or(other.collection)`, `.unscope(:where)`) can return
      // rows that belong to a *different* owner; wiring those would
      // alias the wrong parent onto the child. Compare FK→PK via the
      // reflection so composite-PK reflections work.
      const fkCols = resolvedRefl
        ? Array.isArray(resolvedRefl.foreignKey)
          ? resolvedRefl.foreignKey
          : [resolvedRefl.foreignKey]
        : null;
      const pkCols = resolvedRefl
        ? Array.isArray(resolvedRefl.activeRecordPrimaryKey)
          ? resolvedRefl.activeRecordPrimaryKey
          : [resolvedRefl.activeRecordPrimaryKey]
        : null;
      const ownerRec = owner as unknown as {
        isPersisted?: () => boolean;
        _readAttribute: (n: string) => unknown;
      };
      const ownerPersisted = ownerRec.isPersisted?.() ?? true;
      for (const r of records) {
        const childRec = r as unknown as {
          isPersisted?: () => boolean;
          _readAttribute: (n: string) => unknown;
          _cachedAssociations?: Map<string, unknown>;
        };
        const childPersisted = childRec.isPersisted?.() ?? true;
        let inversable = !ownerPersisted || !childPersisted;
        if (!inversable && fkCols && pkCols && fkCols.length === pkCols.length) {
          inversable = true;
          for (let i = 0; i < fkCols.length; i++) {
            if (childRec._readAttribute(fkCols[i]) !== ownerRec._readAttribute(pkCols[i])) {
              inversable = false;
              break;
            }
          }
        } else if (!inversable && (!fkCols || !pkCols)) {
          // No reflection metadata → preserve prior behavior and wire.
          inversable = true;
        }
        if (!inversable) continue;
        const cache = (childRec._cachedAssociations ??= new Map());
        cache.set(inverseName, owner);
      }
    }

    // Rails' `exec_queries` calls `set_strict_loading` for EVERY record
    // unconditionally — it propagates the owner's mode (which may be
    // "off") onto each child, not just when the owner is strict. Resolve
    // the OO association off the owner (NOT `this._association`, which is
    // the JS-Proxy-wrapped CollectionProxy whose unknown-property trap
    // raises a strict-loading violation) so the n+1-only-vs-mode logic
    // stays in one place.
    const ownerAssoc = (
      owner as unknown as {
        association?: (name: string) => { setStrictLoading?: (record: unknown) => unknown };
      }
    ).association?.(reflection.name);
    if (ownerAssoc && typeof ownerAssoc.setStrictLoading === "function") {
      for (const r of records) ownerAssoc.setStrictLoading(r);
    }

    return records;
  }
}

_setAssociationRelationCtor(AssociationRelation);
