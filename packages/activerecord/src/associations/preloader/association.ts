import type { Base } from "../../base.js";
import type { AssociationReflection } from "../../reflection.js";

/**
 * Handles preloading a single association for a group of records.
 *
 * Mirrors: ActiveRecord::Associations::Preloader::Association
 */
export class Association {
  readonly klass: typeof Base;
  readonly owners: Base[];
  readonly reflection: AssociationReflection;
  protected _preloadScope: any;
  protected _reflectionScope: any;
  protected _associate: boolean;
  protected _run: boolean;

  constructor(
    klass: typeof Base,
    owners: Base[],
    reflection: AssociationReflection,
    preloadScope?: any,
    reflectionScope?: any,
    associateByDefault: boolean = true,
  ) {
    this.klass = klass;
    this.owners = owners;
    this.reflection = reflection;
    this._preloadScope = preloadScope ?? null;
    this._reflectionScope = reflectionScope ?? null;
    this._associate = associateByDefault || preloadScope == null;
    this._run = false;
  }

  isRun(): boolean {
    return this._run;
  }

  runnableLoaders(): Association[] {
    return [this];
  }

  futureClasses(): (typeof Base)[] {
    if (this.isRun()) return [];
    return [this.klass];
  }

  get preloadedRecords(): Base[] {
    return [];
  }
}

/**
 * Mirrors: ActiveRecord::Associations::Preloader::Association::LoaderQuery
 */
export class LoaderQuery {
  readonly scope: any;

  constructor(scope: any) {
    this.scope = scope;
  }
}

/**
 * Mirrors: ActiveRecord::Associations::Preloader::Association::LoaderRecords
 */
export class LoaderRecords {
  readonly records: Base[];

  constructor(records: Base[]) {
    this.records = records;
  }
}
