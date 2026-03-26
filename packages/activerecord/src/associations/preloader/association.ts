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

  constructor(klass: typeof Base, owners: Base[], reflection: AssociationReflection) {
    this.klass = klass;
    this.owners = owners;
    this.reflection = reflection;
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
