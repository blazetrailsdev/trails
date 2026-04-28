import { serializableHash as amSerializableHash } from "@blazetrails/activemodel";
import type { SerializeOptions } from "@blazetrails/activemodel";
import type { Base } from "./base.js";

/**
 * Wrapper around ActiveModel serialization to handle ActiveRecord-specific
 * concerns like inheritance columns (STI).
 *
 * Mirrors: ActiveRecord::Serialization#serializable_hash
 */
export function serializableHash(this: Base, options?: SerializeOptions): Record<string, unknown> {
  // When a model uses STI, we need to exclude the inheritance column
  // from the serialized output (it's just for internal type routing).
  const klass = this.constructor as typeof Base;
  const inheritanceCol = klass.inheritanceColumn;
  if (inheritanceCol && klass.hasAttribute(inheritanceCol)) {
    options = options ? { ...options } : {};

    // Mirror Ruby's `Array(x)`: nil → [], scalar → [scalar], array → array.
    // `Array.from("type")` would split a string into characters, so we
    // can't blindly use it here.
    const raw = (options as { except?: unknown }).except;
    const exceptArray =
      raw == null ? [] : Array.isArray(raw) ? raw : [raw as string | number | symbol];
    // Mirrors: `options[:except] |= Array(inheritance_column)` (set union).
    options.except = [...new Set([...exceptArray.map((v) => String(v)), inheritanceCol])];
  }

  return amSerializableHash(this, options);
}

// private

/**
 * Filters attribute names for serialization. Returns the list of attribute
 * names that should be included in serialization.
 *
 * In ActiveRecord, this is overridable per model (e.g., to exclude certain attrs).
 * The base implementation just delegates to the attribute_names method.
 *
 * Mirrors: ActiveRecord::Serialization.private#attribute_names_for_serialization
 */
export function attributeNamesForSerialization(this: Base): string[] {
  return this.attributeNames();
}
