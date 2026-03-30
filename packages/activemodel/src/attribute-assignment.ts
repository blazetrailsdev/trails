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

function assignAttribute(model: AttributeAssignment, key: string, value: unknown): void {
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
