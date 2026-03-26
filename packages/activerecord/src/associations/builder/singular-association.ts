import { Association } from "./association.js";

/**
 * Base builder for has_one and belongs_to associations.
 *
 * Mirrors: ActiveRecord::Associations::Builder::SingularAssociation
 */
export class SingularAssociation extends Association {
  static override validOptions(options: Record<string, unknown>): string[] {
    return [...super.validOptions(options), "required", "touch"];
  }
}
