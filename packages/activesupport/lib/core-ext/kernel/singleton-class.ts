import { rbObjSingletonClass } from "@blazetrails/ruby-compat/object";

export function classEval<R>(this: object, block: (this: object) => R): R {
  return block.call(rbObjSingletonClass(this));
}
