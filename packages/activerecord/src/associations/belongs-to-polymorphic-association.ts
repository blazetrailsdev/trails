import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import { BelongsToAssociation } from "./belongs-to-association.js";

/**
 * Mirrors: ActiveRecord::Associations::BelongsToPolymorphicAssociation
 */
export class BelongsToPolymorphicAssociation extends BelongsToAssociation {
  constructor(owner: Base, definition: AssociationDefinition) {
    super(owner, definition);
  }
}
