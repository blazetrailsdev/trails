import { rbObjIsKindOf } from "@blazetrails/ruby-compat";

export class ClassMethods {
  /** @internal */
  static jobOrInstantiate(this: new (...args: unknown[]) => unknown, ...args: unknown[]): unknown {
    return rbObjIsKindOf(args[0], this) ? args[0] : new this(...args);
  }
}
