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
    // A Relation is materialized lazily in `call()`; an array is the final set.
    if (!isRelation(this.records)) {
      this._tree.preloadedRecords = this.records;
    }
  }

  isEmpty(): boolean {
    if (this.associations == null) return true;
    // Rails' `empty?` reads `records.length`, which materializes a Relation
    // synchronously — so an *empty* relation returns `true` there. We can't
    // run that query synchronously, so a not-yet-materialized Relation is
    // always reported non-empty and the materializing query is deferred to
    // `call()`. The observable query count is unchanged: Rails materializes in
    // `empty?` then `Batch` rejects the now-empty preloader (1 query, no
    // preload); we materialize in `call()` and the 0-record branch issues no
    // preload (1 query). The deviation is only the boolean a caller would see
    // from `isEmpty()` alone on an empty relation — no current caller gates on
    // that without also calling `call()`.
    if (isRelation(this.records)) return false;
    return this.records.length === 0;
  }

  async call(): Promise<Association[]> {
    if (isRelation(this.records)) {
      this._tree.preloadedRecords = await this.records.toArray();
    }
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
