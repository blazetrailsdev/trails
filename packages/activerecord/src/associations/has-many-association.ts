import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import { loadHasMany } from "../associations.js";
import { DeleteRestrictionError } from "./errors.js";
import { RecordInvalid } from "../validations.js";
import { RecordNotDestroyed } from "../errors.js";
import { CollectionAssociation } from "./collection-association.js";
import { ForeignAssociation } from "./foreign-association.js";
import { compositeQueryConstraintsList } from "../persistence.js";
import { underscore } from "@blazetrails/activesupport";

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
        // Rails: rescues RecordNotDestroyed from destroy!, adds error to owner,
        // and throws :abort to halt the owner's destroy (returns false).
        try {
          await this.destroyAll();
        } catch (e) {
          if (e instanceof RecordNotDestroyed) {
            (this.owner as any).errors?.add("base", e.message);
            return false;
          }
          throw e;
        }
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

  protected override async doAsyncFindTarget(): Promise<Base[]> {
    return loadHasMany(this.owner, this.reflection.name, this.reflection.options);
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
