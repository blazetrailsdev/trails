import { Association } from "./association.js";

function defineMethod(mixin: any, methodName: string, fn: (...args: any[]) => any): void {
  if (!mixin || typeof mixin !== "object") return;
  const existing = Object.getOwnPropertyDescriptor(mixin, methodName);
  if (existing && !existing.configurable) return;
  Object.defineProperty(mixin, methodName, {
    value: fn,
    writable: true,
    configurable: true,
  });
}

/**
 * Base builder for has_one and belongs_to associations.
 *
 * Mirrors: ActiveRecord::Associations::Builder::SingularAssociation
 */
export class SingularAssociation extends Association {
  static override validOptions(options: Record<string, unknown>): string[] {
    return [...super.validOptions(options), "required", "touch"];
  }

  static override defineAccessors(model: any, reflection: any): void {
    super.defineAccessors(model, reflection);
    const mixin = model.prototype ?? model;
    const name = reflection.name ?? reflection;
    const cap = name.charAt(0).toUpperCase() + name.slice(1);

    if (!reflection.options?.polymorphic) {
      this.defineConstructors(mixin, name);
    }

    defineMethod(mixin, `reload${cap}`, function (this: any) {
      return this.association(name).forceReloadReader();
    });
    defineMethod(mixin, `reset${cap}`, function (this: any) {
      return this.association(name).reset();
    });
  }

  static defineConstructors(mixin: any, name: string): void {
    const cap = name.charAt(0).toUpperCase() + name.slice(1);
    defineMethod(mixin, `build${cap}`, function (this: any, ...args: any[]) {
      return this.association(name).build(...args);
    });
    defineMethod(mixin, `create${cap}`, function (this: any, ...args: any[]) {
      return this.association(name).create(...args);
    });
    defineMethod(mixin, `create${cap}Bang`, function (this: any, ...args: any[]) {
      return this.association(name).createBang(...args);
    });
  }
}
