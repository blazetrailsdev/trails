import type { Base } from "../../base.js";
import type { AssociationReflection } from "../../reflection.js";
import { Association } from "./association.js";

/**
 * Handles preloading through associations by first loading the
 * intermediate records, then loading the target records.
 *
 * Mirrors: ActiveRecord::Associations::Preloader::ThroughAssociation
 */
export class ThroughAssociation extends Association {
  constructor(
    klass: typeof Base,
    owners: Base[],
    reflection: AssociationReflection,
    preloadScope?: any,
    reflectionScope?: any,
    associateByDefault: boolean = true,
  ) {
    super(klass, owners, reflection, preloadScope, reflectionScope, associateByDefault);
  }
}
