import { underscore } from "@rails-ts/activesupport";
import { SingularAssociation } from "./singular-association.js";

/**
 * Mirrors: ActiveRecord::Associations::Builder::BelongsTo
 */
export class BelongsTo extends SingularAssociation {
  static override validOptions(options: Record<string, unknown>): string[] {
    return [...super.validOptions(options), "polymorphic", "counterCache", "optional", "default"];
  }

  protected override defineAssociation(
    model: any,
    name: string,
    options: Record<string, unknown>,
  ): void {
    model._associations.push({ type: "belongsTo", name, options });

    if (options.required || options.optional === false) {
      const foreignKey = (options.foreignKey as string) ?? `${underscore(name)}_id`;
      if (typeof model.validates === "function") {
        model.validates(foreignKey, { presence: true });
      }
    }
  }
}
