import type { Base } from "../base.js";
import type { Association } from "./preloader/association.js";
import { Branch } from "./preloader/branch.js";
import { Batch } from "./preloader/batch.js";

export interface PreloaderOptions {
  records: Base[];
  associations: any;
  scope?: any;
  availableRecords?: Base[];
  associateByDefault?: boolean;
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
  readonly records: Base[];
  readonly associations: any;
  readonly scope: any;
  readonly associateByDefault: boolean;

  private _tree: Branch;
  private _availableRecords: Base[];

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
    this._tree.preloadedRecords = this.records;
  }

  isEmpty(): boolean {
    return this.associations == null || this.records.length === 0;
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
