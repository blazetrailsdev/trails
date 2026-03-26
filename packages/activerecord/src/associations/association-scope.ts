import type { AssociationReflection } from "../reflection.js";

/**
 * Builds the scope (query) for an association based on its reflection.
 *
 * Mirrors: ActiveRecord::Associations::AssociationScope
 */
export class AssociationScope {
  static create(reflection: AssociationReflection): AssociationScope {
    return new AssociationScope(reflection);
  }

  readonly reflection: AssociationReflection;

  constructor(reflection: AssociationReflection) {
    this.reflection = reflection;
  }
}

/**
 * Mirrors: ActiveRecord::Associations::AssociationScope::ReflectionProxy
 */
export class ReflectionProxy {
  readonly reflection: AssociationReflection;

  constructor(reflection: AssociationReflection) {
    this.reflection = reflection;
  }
}
