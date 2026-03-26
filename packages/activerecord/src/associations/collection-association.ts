import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import { Association } from "./association.js";

/**
 * Base class for has_many and has_and_belongs_to_many associations.
 *
 * Mirrors: ActiveRecord::Associations::CollectionAssociation
 */
export class CollectionAssociation extends Association {
  declare target: Base[];

  constructor(owner: Base, definition: AssociationDefinition) {
    super(owner, definition);
    this.target = [];
  }

  get size(): number {
    return this.target.length;
  }

  isEmpty(): boolean {
    return this.size === 0;
  }

  get reader(): Base[] {
    return this.target;
  }
}
