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

/** @internal */
function isRelation(records: Base[] | Relation<Base>): records is Relation<Base> {
  return !Array.isArray(records) && typeof (records as any).toArray === "function";
}

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
    this._materialized = !isRelation(this.records);
    if (this._materialized) {
      this._tree.setPreloadedRecords(this.records as Base[]);
    }
  }

  async isEmpty(): Promise<boolean> {
    if (this.associations == null) return true;
    await this.materialize();
    return (await this._tree.preloadedRecords()).length === 0;
  }

  async materialize(): Promise<void> {
    if (this._materialized) return;
    this._tree.setPreloadedRecords(await (this.records as Relation<Base>));
    this._materialized = true;
  }

  async call(): Promise<Association[]> {
    const batch = new Batch([this], this._availableRecords);
    await batch.call();
    return this.loaders();
  }

  get branches(): Branch[] {
    return this._tree.children;
  }

  async loaders(): Promise<Association[]> {
    const loaders: Association[] = [];
    for (const branch of this.branches) {
      loaders.push(...(await branch.loaders()));
    }
    return loaders;
  }
}
