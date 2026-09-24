import type { Module } from "@blazetrails/ruby-compat";
import { Association, type AssociationInstanceHost } from "./association.js";

export class SingularAssociation extends Association {
  static override validOptions(options: Record<string, unknown>): string[] {
    return [...super.validOptions(options), "required", "touch"];
  }

  static override defineAccessors(model: any, reflection: any): void {
    super.defineAccessors(model, reflection);
    const mixin: Module = model.generatedAssociationMethods();
    const name = reflection.name;
    const cap = name.charAt(0).toUpperCase() + name.slice(1);

    if (!reflection.options?.polymorphic) {
      this.defineConstructors(mixin, name);
    }

    mixin.defineMethod(`reload${cap}`, function (this: AssociationInstanceHost) {
      return this.association(name).forceReloadReader();
    });
    mixin.defineMethod(`reset${cap}`, function (this: AssociationInstanceHost) {
      return this.association(name).reset();
    });
  }

  static defineConstructors(mixin: Module, name: string): void {
    const cap = name.charAt(0).toUpperCase() + name.slice(1);
    mixin.defineMethod(`build${cap}`, function (this: AssociationInstanceHost, ...args: unknown[]) {
      return this.association(name).build(...args);
    });
    mixin.defineMethod(
      `create${cap}`,
      function (this: AssociationInstanceHost, ...args: unknown[]) {
        return this.association(name).create(...args);
      },
    );
    mixin.defineMethod(
      `create${cap}Bang`,
      function (this: AssociationInstanceHost, ...args: unknown[]) {
        return this.association(name).createBang(...args);
      },
    );
  }
}
