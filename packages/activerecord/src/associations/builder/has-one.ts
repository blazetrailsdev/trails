import { ArgumentError } from "@blazetrails/activemodel";
import { SingularAssociation } from "./singular-association.js";
import { addAutosaveAssociationCallbacks } from "../../autosave-association.js";

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

  static override defineConstructors(mixin: any, name: string): void {
    super.defineConstructors(mixin, name);
    if (!mixin || typeof mixin !== "object") return;
    const cap = name.charAt(0).toUpperCase() + name.slice(1);
    Object.defineProperty(mixin, `build${cap}`, {
      value: function (this: { association(n: string): any }, ...args: unknown[]) {
        const assoc = this.association(name);
        if (typeof assoc.findTargetNeeded === "function" && assoc.findTargetNeeded()) {
          return assoc.loadTargetForBuild().then(() => assoc.build(...args));
        }
        return assoc.build(...args);
      },
      writable: true,
      configurable: true,
    });
  }

  static override defineWriters(mixin: object, name: string): void {
    if (!mixin || typeof mixin !== "object") return;
    const cap = name.charAt(0).toUpperCase() + name.slice(1);
    const setter = Object.getOwnPropertyDescriptor(mixin, `set${cap}`);
    if (!setter || setter.configurable) {
      Object.defineProperty(mixin, `set${cap}`, {
        value: function (
          this: { association(n: string): { writer(v: unknown): unknown } },
          value: unknown,
        ) {
          return this.association(name).writer(value);
        },
        writable: true,
        configurable: true,
      });
    }

    const rubyWriter = Object.getOwnPropertyDescriptor(mixin, `${name}=`);
    if (!rubyWriter || rubyWriter.configurable) {
      Object.defineProperty(mixin, `${name}=`, {
        value: function (
          this: { association(n: string): { writer(v: unknown): unknown } },
          value: unknown,
        ) {
          return this.association(name).writer(value);
        },
        writable: true,
        configurable: true,
      });
    }
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
    addAutosaveAssociationCallbacks.call(model, reflection);
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
    if (options.required) {
      model.validatesPresenceOf(reflection.name, { message: ":required" });
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
      if (typeof instance.touch !== "function") return;
      if (touch === true) {
        await instance.touch();
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

    const savedChangesQ = (record: any) =>
      typeof record.isSavedChanges === "function" && record.isSavedChanges();

    model.afterCreate(callback, { if: savedChangesQ });
    model.afterCreateCommit(async (record: any) => {
      record.association(name).resetNegativeCache();
    });
    model.afterUpdate(callback, { if: savedChangesQ });
    model.afterDestroy(async (record: any) => {
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
