import { ForbiddenAttributesError } from "./forbidden-attributes-protection.js";
import { UnknownAttributeError } from "./errors.js";

interface PermittedAttributes {
  permitted?(): boolean;
}

function sanitizeForMassAssignment(attributes: Record<string, unknown>): Record<string, unknown> {
  const attrs = attributes as Record<string, unknown> & PermittedAttributes;
  if (typeof attrs.permitted === "function") {
    if (!attrs.permitted()) {
      throw new ForbiddenAttributesError();
    }
  }
  return attributes;
}

export interface AttributeAssignment {
  writeAttribute(name: string, value: unknown): void;
  attributeWriterMissing?(name: string, value: unknown): void;
}

function typeNameForError(value: unknown): string {
  if (value === null) return "Null";
  if (Array.isArray(value)) return "Array";
  const t = typeof value;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function assignAttributes(model: AttributeAssignment, newAttributes: unknown): void {
  if (typeof newAttributes !== "object" || newAttributes === null || Array.isArray(newAttributes)) {
    throw new ArgumentError(
      `When assigning attributes, you must pass a hash as an argument, ${typeNameForError(newAttributes)} passed.`,
    );
  }

  const attrs = newAttributes as Record<string, unknown>;
  if (Object.keys(attrs).length === 0) return;

  const sanitized = sanitizeForMassAssignment(attrs);

  for (const [key, value] of Object.entries(sanitized)) {
    assignAttribute(model, key, value);
  }
}

/**
 * Walk instance → prototype chain looking for a setter descriptor for `key`.
 * Mirrors Rails' `public_send("#{k}=", v)` dispatch
 * (activemodel/lib/active_model/attribute_assignment.rb:67-70), which routes
 * through any user-defined `attr_writer` / `def name=` before the attribute
 * store sees the value.
 *
 * Starts at the instance itself (JS analogue of Ruby singleton methods —
 * `Object.defineProperty(model, key, { set })`) and walks up, stopping before
 * `Object.prototype` so built-in accessors like `__proto__` can't hijack
 * mass assignment.
 *
 * Matches either of:
 * - a user-defined setter on a subclass prototype
 *   (`class Cat extends Model { set name(v) { … } }`), or
 * - a framework-generated setter installed by `this.attribute("name", …)`
 *   (see attributes.ts:110-120), which just forwards to `writeAttribute` —
 *   so the net behaviour for non-overridden attributes is unchanged. The
 *   `hasOwnProperty` guard in `attributes.ts` preserves a user-authored
 *   `set name` if declared in the class body.
 *
 * Walks the full chain regardless of shadowing descriptors: Ruby looks up
 * `name=` as its own method, independent of any `name` getter. A get-only
 * accessor or a data descriptor at one level does not hide a setter
 * defined higher up, so neither should our walk.
 */
function findSetter(model: object, key: string): ((this: object, value: unknown) => void) | null {
  let obj: object | null = model;
  while (obj && obj !== Object.prototype) {
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    if (desc && typeof desc.set === "function") {
      return desc.set as (this: object, value: unknown) => void;
    }
    obj = Object.getPrototypeOf(obj);
  }
  return null;
}

function assignAttribute(model: AttributeAssignment, key: string, value: unknown): void {
  const setter = findSetter(model, key);
  if (setter) {
    setter.call(model, value);
    return;
  }
  try {
    model.writeAttribute(key, value);
  } catch (error) {
    if (error instanceof UnknownAttributeError) {
      if (typeof model.attributeWriterMissing === "function") {
        model.attributeWriterMissing(key, value);
      } else {
        attributeWriterMissing(model, key, value);
      }
    } else {
      throw error;
    }
  }
}

export function attributeWriterMissing(
  model: AttributeAssignment,
  name: string,
  _value: unknown,
): void {
  throw new UnknownAttributeError(model, name);
}

class ArgumentError extends globalThis.Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgumentError";
  }
}

export { ArgumentError };
