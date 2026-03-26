/**
 * Module mixed into has_many and has_one associations to provide
 * foreign-key based behavior.
 *
 * Mirrors: ActiveRecord::Associations::ForeignAssociation
 */
export class ForeignAssociation {
  foreignKeyPresent: boolean;

  constructor() {
    this.foreignKeyPresent = false;
  }
}
