import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import { loadHasMany } from "../associations.js";
import { DeleteRestrictionError } from "./errors.js";
import { CollectionAssociation } from "./collection-association.js";

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
  async handleDependency(): Promise<void> {
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
          const ownerAny = this.owner as any;
          if (typeof ownerAny.errors?.add === "function") {
            const name = this.reflection.name;
            ownerAny.errors.add("base", "invalid", {
              message: `Cannot delete record because dependent ${name} exists`,
            });
          }
          throw new DeleteRestrictionError(this.owner, this.reflection.name);
        }
        break;
      }

      case "destroy": {
        const records = await this.loadTarget();
        for (const record of records) {
          (record as any).destroyedByAssociation = this.reflection;
        }
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
      if (!saved && raise)
        throw new Error(`Failed to save the new associated ${this.reflection.name}.`);
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
}

/** @internal */
function countRecords(assoc: HasManyAssociation): Promise<number> {
  return (assoc as any).scope?.()?.count?.() ?? Promise.resolve(0);
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

/** @internal */
function updateCounterInMemory(assoc: HasManyAssociation, difference: number): void {
  const counterCol = assoc.reflection.options.counterCache;
  if (counterCol) {
    const owner = assoc.owner as any;
    const current = Number(owner.readAttribute?.(String(counterCol)) ?? 0);
    owner.writeAttribute?.(String(counterCol), current + difference);
  }
}

/** @internal */
function deleteCount(_assoc: HasManyAssociation, method: string, scope: any): Promise<number> {
  if (method === "deleteAll") return scope.deleteAll?.() ?? Promise.resolve(0);
  return scope.updateAll?.() ?? Promise.resolve(0);
}

/** @internal */
async function deleteOrNullifyAllRecords(assoc: HasManyAssociation, method: string): Promise<void> {
  // Rails: count = delete_count(method, scope); update_counter(-count)
  const scope = (assoc as any).scope?.();
  const count = await deleteCount(assoc, method, scope);
  if (count > 0) await updateCounter(assoc, -count);
}

/** @internal */
function deleteRecords(assoc: HasManyAssociation, records: Base[], method: string): Promise<void> {
  return (assoc as any).delete?.(...records) ?? Promise.resolve();
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
