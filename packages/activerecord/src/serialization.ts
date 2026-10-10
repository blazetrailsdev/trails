import { serializableHash as amSerializableHash } from "@blazetrails/activemodel";
import type { SerializeOptions } from "@blazetrails/activemodel";
import type { Base } from "./base.js";
import { kernelArray } from "@blazetrails/activesupport";
import { union } from "@blazetrails/ruby-compat";

export function serializableHash(this: Base, options?: SerializeOptions): Record<string, unknown> {
  const klass = this.constructor as typeof Base;
  if (klass._hasAttribute(klass.inheritanceColumn!)) {
    options = options ? { ...options } : {};

    options.except = kernelArray(options.except).map((v) => String(v));
    options.except = union(options.except, kernelArray(klass.inheritanceColumn));
  }

  return amSerializableHash.call(this, options);
}

/** @internal */
export function attributeNamesForSerialization(this: Base): string[] {
  return this.attributeNames();
}
