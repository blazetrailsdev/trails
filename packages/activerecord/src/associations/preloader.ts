import type { Base } from "../base.js";
import type { Relation } from "../relation.js";
import type { Association } from "./preloader/association.js";
import { Branch } from "./preloader/branch.js";
import { Batch } from "./preloader/batch.js";

export interface PreloaderOptions {
  records: Base[] | Relation<Base>;
  associations: any;
  scope?: any;
  availableRecords?: (Base | Base[])[];
  associateByDefault?: boolean;
}

/**
 * Duck-type check for a Relation passed as `records`. Avoids a runtime import
 * of Relation (which would create a require cycle through associations).
 * @internal
 */
function isRelation(records: Base[] | Relation<Base>): records is Relation<Base> {
  return !Array.isArray(records) && typeof (records as any).toArray === "function";
}

/**
 * Implements eager loading of associations. Given a set of records and
 * association names, loads all associated records in as few queries as
 * possible.
 *
 * Creates a Branch tree mirroring the requested association hierarchy,
 * then uses Batch to walk the tree, find runnable loaders, and execute
 * them in groups.
 *
 * Mirrors: ActiveRecord::Associations::Preloader
 */
export class Preloader {
  readonly records: Base[] | Relation<Base>;
  readonly associations: any;
  readonly scope: any;
  readonly associateByDefault: boolean;

  private _tree: Branch;
  private _availableRecords: (Base | Base[])[];
  private _materialized: boolean;

  constructor(options: PreloaderOptions) {
    this.records = options.records;
    this.associations = options.associations;
    this.scope = options.scope ?? null;
    this.associateByDefault = options.associateByDefault ?? true;
    this._availableRecords = options.availableRecords ?? [];

    this._tree = new Branch({
      parent: null,
      association: null,
      children: this.associations,
      associateByDefault: this.associateByDefault,
      scope: this.scope,
    });
    // An array is the final record set; a Relation is materialized lazily by
    // `materialize()`, driven from the `isEmpty()` check in `Batch`.
    this._materialized = !isRelation(this.records);
    if (this._materialized) {
      this._tree.preloadedRecords = this.records as Base[];
    }
  }

  /**
   * Rails' `empty?` is `associations.nil? || records.length == 0`, where
   * `records.length` materializes a Relation. We can't run that query
   * synchronously (async I/O), so emptiness is async: it materializes the
   * Relation just as Rails does, then reads the final record count — so an
   * *empty* Relation correctly reports `true`. `materialize()` runs the query
   * once per preloader, so `Batch`'s reject-then-load keeps the observable
   * query count unchanged.
   */
  async isEmpty(): Promise<boolean> {
    if (this.associations == null) return true;
    await this.materialize();
    return this._tree.preloadedRecords.length === 0;
  }

  /**
   * Loads a Relation's records into the root branch exactly once. A no-op for
   * the array path (already set in the constructor) and for repeat calls.
   */
  async materialize(): Promise<void> {
    if (this._materialized) return;
    this._tree.preloadedRecords = await (this.records as Relation<Base>).toArray();
    this._materialized = true;
  }

  async call(): Promise<Association[]> {
    const batch = new Batch([this], this._availableRecords);
    await batch.call();
    return this.loaders;
  }

  get branches(): Branch[] {
    return this._tree.children;
  }

  get loaders(): Association[] {
    return this.branches.flatMap((b) => b.loaders);
  }
}
