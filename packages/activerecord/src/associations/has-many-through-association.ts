import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import { HasManyAssociation } from "./has-many-association.js";

/**
 * Mirrors: ActiveRecord::Associations::HasManyThroughAssociation
 */
export class HasManyThroughAssociation extends HasManyAssociation {
  constructor(owner: Base, definition: AssociationDefinition) {
    super(owner, definition);
  }
}
