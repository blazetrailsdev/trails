import { serializableHash as amSerializableHash } from "@blazetrails/activemodel";
import type { SerializeOptions } from "@blazetrails/activemodel";
import type { Base } from "./base.js";
import { kernelArray } from "@blazetrails/activesupport";

export function serializableHash(this: Base, options?: SerializeOptions): Record<string, unknown> {
  const klass = this.constructor;
  if (klass._hasAttribute(klass.inheritanceColumn as string)) {
    options = options ? { ...options } : {};

    options.except = kernelArray(options.except).map((v) => String(v));
    options.except = [...new Set([...options.except, ...kernelArray(klass.inheritanceColumn)])];
  }

  return amSerializableHash.call(this, options);
}

/** @internal */
export function attributeNamesForSerialization(this: Base): string[] {
  return this.attributeNames();
}
