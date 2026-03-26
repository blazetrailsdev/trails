import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import { Association } from "./association.js";

/**
 * Base class for has_one and belongs_to associations.
 *
 * Mirrors: ActiveRecord::Associations::SingularAssociation
 */
export class SingularAssociation extends Association {
  declare target: Base | null;

  constructor(owner: Base, definition: AssociationDefinition) {
    super(owner, definition);
  }

  get reader(): Base | null {
    return this.target;
  }
}
