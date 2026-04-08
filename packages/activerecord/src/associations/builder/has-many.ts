import { CollectionAssociation } from "./collection-association.js";

/**
 * Mirrors: ActiveRecord::Associations::Builder::HasMany
 */
export class HasMany extends CollectionAssociation {
  static override macro(): string {
    return "hasMany";
  }

  static override validOptions(options: Record<string, unknown>): string[] {
    const valid = [
      ...super.validOptions(options),
      "counterCache",
      "joinTable",
      "indexErrors",
      "as",
      "through",
    ];
    if (options.as) valid.push("foreignType");
    if (options.through) valid.push("source", "sourceType", "disableJoins");
    if (options.dependent === "destroyAsync") valid.push("ensuringOwnerWas");
    return valid;
  }

  static override validDependentOptions(): string[] {
    return [
      "destroy",
      "delete",
      "deleteAll",
      "nullify",
      "restrictWithError",
      "restrictWithException",
      "destroyAsync",
    ];
  }
}
