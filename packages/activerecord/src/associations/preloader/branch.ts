import type { Base } from "../../base.js";
import type { AssociationReflection } from "../../reflection.js";

/**
 * Represents a single branch in the preloader tree — one association
 * on a set of records, potentially with nested children.
 *
 * Mirrors: ActiveRecord::Associations::Preloader::Branch
 */
export class Branch {
  readonly association: string;
  readonly records: Base[];
  readonly reflection: AssociationReflection | undefined;
  readonly children: Branch[];

  constructor(association: string, records: Base[], reflection?: AssociationReflection) {
    this.association = association;
    this.records = records;
    this.reflection = reflection;
    this.children = [];
  }
}
