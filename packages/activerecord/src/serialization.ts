import { serializableHash as amSerializableHash } from "@blazetrails/activemodel";
import type { SerializeOptions } from "@blazetrails/activemodel";
import type { Base } from "./base.js";

export function serializableHash(this: Base, options?: SerializeOptions): Record<string, unknown> {
  const klass = this.constructor as typeof Base;
  const inheritanceCol = klass.inheritanceColumn;
  if (inheritanceCol && klass.hasAttribute(inheritanceCol)) {
    options = options ? { ...options } : {};

    const raw = (options as { except?: unknown }).except;
    const exceptArray =
      raw == null ? [] : Array.isArray(raw) ? raw : [raw as string | number | symbol];
    options.except = [...new Set([...exceptArray.map((v) => String(v)), inheritanceCol])];
  }

  return amSerializableHash(this, options);
}

/** @internal */
export function attributeNamesForSerialization(this: Base): string[] {
  return this.attributeNames();
}
