import { ArgumentError } from "@blazetrails/activemodel";
import { SingularAssociation } from "./singular-association.js";
import { afterCreate, afterUpdate, afterDestroy } from "../../callbacks.js";
import { addAutosaveAssociationCallbacks } from "../../autosave-association.js";

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
      options = scope;
      scope = null;
    }
    if (options.counterCache) {
      throw new ArgumentError("has_one associations do not support counter_cache");
    }
    return super.build(model, name, scope, options);
  }

  static override defineWriters(mixin: object, name: string): void {
    if (!mixin || typeof mixin !== "object") return;
    const existing = Object.getOwnPropertyDescriptor(mixin, name);
    if (existing && !existing.configurable) return;
    Object.defineProperty(mixin, name, {
      get: existing?.get,
      // A JS property setter cannot `await`, so the has_one writer queues the
      // change (sets `_pendingReplace`) for the owner's next `save()` to flush —
      // no DB I/O, no floating promise. Callers that need the Rails-faithful
      // immediate persist use `record.association(name).writer(value)` and await it.
      set(this: { association(n: string): { queueWrite(v: unknown): void } }, value: unknown) {
        this.association(name).queueWrite(value);
      },
      configurable: true,
    });
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
    // Mirrors Rails AutosaveAssociation::AssociationBuilderExtension.build —
    // registered for every has_one regardless of the `autosave:` option.
    // The save callbacks gate on `options.autosave` internally; the validate
    // callback gates on `reflection.validate?` (true for `validate: true`).
    addAutosaveAssociationCallbacks(model, reflection);
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
    if (options.required) {
      model.validatesPresenceOf(reflection.name, { message: "required" });
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

    // Mirrors Rails `HasOne.touch_record`, which touches the owner immediately
    // via `instance.touch` (unlike `BelongsTo.touch_record`, which defers with
    // `touch_later`).
    if (instance && typeof instance.isPersisted === "function" && instance.isPersisted()) {
      if (typeof instance.touch !== "function") return;
      if (touch === true) {
        await instance.touch();
      } else if (Array.isArray(touch)) {
        if (touch.length === 0) return;
        await instance.touch(...touch);
      } else {
        await instance.touch(touch);
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
        if (record._touchingAssociations) return;
        record._touchingAssociations = true;
        try {
          await HasOne.touchRecord(record, name, touch);
        } finally {
          record._touchingAssociations = false;
        }
      });
    }
  }
}
