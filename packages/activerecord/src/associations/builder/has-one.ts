import { SingularAssociation } from "./singular-association.js";

/**
 * Mirrors: ActiveRecord::Associations::Builder::HasOne
 */
export class HasOne extends SingularAssociation {
  static override validOptions(options: Record<string, unknown>): string[] {
    return [
      ...super.validOptions(options),
      "as",
      "through",
      "source",
      "sourceType",
      "disableJoins",
    ];
  }

  protected override defineAssociation(
    model: any,
    name: string,
    options: Record<string, unknown>,
  ): void {
    if (options.counterCache) {
      throw new Error("has_one associations do not support counter_cache");
    }
    model._associations.push({ type: "hasOne", name, options });
  }
}
