import type { AssociationReflection } from "../reflection.js";
import { AssociationScope } from "./association-scope.js";

/**
 * Builds scopes for associations that disable joins, querying each
 * database separately and stitching results in memory.
 *
 * Mirrors: ActiveRecord::Associations::DisableJoinsAssociationScope
 */
export class DisableJoinsAssociationScope extends AssociationScope {
  constructor(reflection: AssociationReflection) {
    super(reflection);
  }
}
