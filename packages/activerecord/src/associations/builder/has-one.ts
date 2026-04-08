import { SingularAssociation } from "./singular-association.js";

/**
 * Mirrors: ActiveRecord::Associations::Builder::HasOne
 */
export class HasOne extends SingularAssociation {
  static override macro(): string {
    return "hasOne";
  }

  static override validOptions(options: Record<string, unknown>): string[] {
    const valid = [...super.validOptions(options), "as", "through", "counterCache"];
    if (options.as) valid.push("foreignType");
    if (options.dependent === "destroyAsync") valid.push("ensuringOwnerWas");
    if (options.through) valid.push("source", "sourceType", "disableJoins");
    return valid;
  }

  static override build(
    model: any,
    name: string,
    scope: ((...args: any[]) => any) | null | Record<string, unknown>,
    options: Record<string, unknown> = {},
  ): any {
    if (
      typeof scope === "object" &&
      scope !== null &&
      !Array.isArray(scope) &&
      !(scope instanceof Function)
    ) {
      options = scope as Record<string, unknown>;
      scope = null;
    }
    if (options.counterCache) {
      throw new Error("has_one associations do not support counter_cache");
    }
    return super.build(model, name, scope, options);
  }

  static override validDependentOptions(): string[] {
    return [
      "destroy",
      "destroyAsync",
      "delete",
      "nullify",
      "restrictWithError",
      "restrictWithException",
    ];
  }

  static override defineCallbacks(model: any, reflection: any): void {
    super.defineCallbacks(model, reflection);
    const options = reflection.options ?? {};
    if (options.touch) {
      this.addTouchCallbacks(model, reflection);
    }
  }

  static override addDestroyCallbacks(model: any, reflection: any): void {
    const options = reflection.options ?? {};
    if (!options.through) {
      super.addDestroyCallbacks(model, reflection);
    }
  }

  static override defineValidations(model: any, reflection: any): void {
    super.defineValidations(model, reflection);
    const options = reflection.options ?? {};
    if (options.required && typeof model.validate === "function") {
      model.validate((record: any) => {
        const instance =
          typeof record[reflection.name] === "function"
            ? record[reflection.name]()
            : record[reflection.name];
        if (
          (instance === null || instance === undefined) &&
          record.errors &&
          typeof record.errors.add === "function"
        ) {
          record.errors.add(reflection.name, "required");
        }
      });
    }
  }

  static async touchRecord(record: any, name: string, touch: any): Promise<void> {
    const instance = typeof record[name] === "function" ? record[name]() : record[name];
    if (instance && typeof instance.isPersisted === "function" && instance.isPersisted()) {
      if (touch !== true && typeof instance.touch === "function") {
        await instance.touch(touch);
      } else if (typeof instance.touch === "function") {
        await instance.touch();
      }
    }
  }

  static addTouchCallbacks(_model: any, _reflection: any): void {
    // Touch callbacks are handled by touchBelongsToParents() in
    // associations.ts (from the child's belongsTo side). Migrating to
    // per-association callbacks registered here is a follow-up.
  }
}
