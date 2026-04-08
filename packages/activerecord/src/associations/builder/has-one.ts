import { SingularAssociation } from "./singular-association.js";
import { afterCreate, afterUpdate, afterDestroy } from "../../callbacks.js";

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
    let instance: any;
    if (typeof record.association === "function") {
      const assoc = record.association(name);
      instance = typeof assoc.loadTarget === "function" ? await assoc.loadTarget() : assoc.target;
    } else {
      instance = typeof record[name] === "function" ? record[name]() : record[name];
    }

    if (instance && typeof instance.isPersisted === "function" && instance.isPersisted()) {
      const touchFn = instance.touchLater ?? instance.touch;
      if (typeof touchFn !== "function") return;
      if (touch === true) {
        await touchFn.call(instance);
      } else if (Array.isArray(touch)) {
        if (touch.length === 0) return;
        await touchFn.call(instance, ...touch);
      } else {
        await touchFn.call(instance, touch);
      }
    }
  }

  static addTouchCallbacks(model: any, reflection: any): void {
    const name = reflection.name ?? reflection;
    const touch = reflection.options?.touch;

    const callback = async (record: any) => {
      await HasOne.touchRecord(record, name, touch);
    };

    afterCreate(model, callback);
    afterUpdate(model, callback);
    afterDestroy(model, async (record: any) => {
      if (typeof record.isNewRecord !== "function" || !record.isNewRecord()) {
        await HasOne.touchRecord(record, name, touch);
      }
    });
    if (typeof model.afterTouch === "function") {
      model.afterTouch(async (record: any) => {
        if ((record as any)._touchingAssociations) return;
        (record as any)._touchingAssociations = true;
        try {
          await HasOne.touchRecord(record, name, touch);
        } finally {
          (record as any)._touchingAssociations = false;
        }
      });
    }
  }
}
