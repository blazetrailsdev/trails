import type { Module } from "@blazetrails/ruby-compat";
import { SingularAssociation } from "./singular-association.js";

export class HasOne extends SingularAssociation {
  static override macro(): string {
    return "hasOne";
  }

  static override validOptions(options: Record<string, unknown>): string[] {
    const valid = [...super.validOptions(options), "as", "through"];
    if (options.as) valid.push("foreignType");
    if (options.dependent === "destroyAsync") valid.push("ensuringOwnerWas");
    if (options.through) valid.push("source", "sourceType", "disableJoins");
    return valid;
  }

  /** @noRailsEquivalent CONVERGEABLE converge-has-one-builder-define-writers */
  static override defineWriters(mixin: Module, name: string): void {
    const cap = name.charAt(0).toUpperCase() + name.slice(1);
    for (const methodName of [`set${cap}`, `${name}=`]) {
      mixin.defineMethod(
        methodName,
        function (
          this: { association(n: string): { writer(v: unknown): unknown } },
          value: unknown,
        ) {
          return this.association(name).writer(value);
        },
      );
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
    if (reflection.options.touch) this.addTouchCallbacks(model, reflection);
  }

  static override addDestroyCallbacks(model: any, reflection: any): void {
    if (!reflection.options.through) super.addDestroyCallbacks(model, reflection);
  }

  static override defineValidations(model: any, reflection: any): void {
    super.defineValidations(model, reflection);
    if (reflection.options.required) {
      model.validatesPresenceOf(reflection.name, { message: ":required" });
    }
  }

  static async touchRecord(record: any, name: string, touch: any): Promise<void> {
    const instance = await record[name];

    if (instance?.isPersisted()) {
      if (touch !== true) {
        await instance.touch(touch);
      } else {
        await instance.touch();
      }
    }
  }

  static addTouchCallbacks(model: any, reflection: any): void {
    const name = reflection.name;
    const touch = reflection.options.touch;

    const callback = (record: any) => HasOne.touchRecord(record, name, touch);
    model.afterCreate(callback, { if: ":isSavedChanges" });
    model.afterCreateCommit((record: any) => record.association(name).resetNegativeCache());
    model.afterUpdate(callback, { if: ":isSavedChanges" });
    model.afterDestroy(callback);
    model.afterTouch(callback);
  }
}
