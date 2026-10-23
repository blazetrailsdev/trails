import { ObjectSpace } from "@blazetrails/ruby-compat";
import type { CompiledMethodContainer } from "../base.js";
import { Template } from "../template.js";

export class Inline extends Template {
  static Finalizer =
    (methodName: string, mod: CompiledMethodContainer): (() => void) =>
    () => {
      mod._compiledMethods.delete(methodName);
    };

  protected override async compile(mod: CompiledMethodContainer): Promise<void> {
    await super.compile(mod);
    ObjectSpace.defineFinalizer(this, Inline.Finalizer(this.methodName(), mod));
  }
}
