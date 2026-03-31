import type { Base } from "./base.js";
import { Json } from "./type/json.js";
import { SerializationTypeMismatch } from "./errors.js";

interface Coder {
  dump(value: unknown): string;
  load(raw: unknown): unknown;
}

const _jsonType = new Json();

const JSON_CODER: Coder = {
  dump(value: unknown): string {
    return _jsonType.serialize(value) ?? "null";
  },
  load(raw: unknown): unknown {
    return _jsonType.deserialize(raw);
  },
};

const ARRAY_CODER: Coder = {
  dump(value: unknown): string {
    return JSON.stringify(Array.isArray(value) ? value : []);
  },
  load(raw: unknown): unknown[] {
    if (raw === null || raw === undefined) return [];
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return Array.isArray(raw) ? raw : [];
  },
};

const HASH_CODER: Coder = {
  dump(value: unknown): string {
    return JSON.stringify(typeof value === "object" && value !== null ? value : {});
  },
  load(raw: unknown): Record<string, unknown> {
    if (raw === null || raw === undefined) return {};
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return typeof parsed === "object" && parsed !== null ? parsed : {};
      } catch {
        return {};
      }
    }
    return typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  },
};

/**
 * Declare that an attribute should be serialized before saving and
 * deserialized when loading.
 *
 * Mirrors: ActiveRecord::Base.serialize
 *
 * Usage:
 *   serialize(User, 'preferences', { coder: 'json' })
 *   serialize(User, 'tags', { coder: 'array' })
 *   serialize(User, 'settings', { coder: 'hash' })
 *   serialize(User, 'data', { coder: customCoder })
 */
export function serialize(
  modelClass: typeof Base,
  attribute: string,
  options: { coder?: "json" | "array" | "hash" | Coder; type?: "Array" | "Hash" } = {},
): void {
  let coder: Coder;
  if (!options.coder || options.coder === "json") {
    coder = JSON_CODER;
  } else if (options.coder === "array") {
    coder = ARRAY_CODER;
  } else if (options.coder === "hash") {
    coder = HASH_CODER;
  } else {
    coder = options.coder;
  }

  const expectedType =
    options.type ??
    (options.coder === "array" ? "Array" : options.coder === "hash" ? "Hash" : undefined);

  // Store the coder config on the class
  if (!(modelClass as any)._serializedAttributes) {
    (modelClass as any)._serializedAttributes = new Map();
  }
  if (!(modelClass as any)._serializedExpectedTypes) {
    (modelClass as any)._serializedExpectedTypes = new Map();
  }
  (modelClass as any)._serializedAttributes.set(attribute, coder);
  if (expectedType) {
    (modelClass as any)._serializedExpectedTypes.set(attribute, expectedType);
  } else {
    (modelClass as any)._serializedExpectedTypes.delete(attribute);
  }
  if (!(modelClass as any)._serializeWrapped) {
    (modelClass as any)._serializeWrapped = true;
    const originalRead = modelClass.prototype.readAttribute;

    modelClass.prototype.readAttribute = function (name: string): unknown {
      const raw = originalRead.call(this, name);
      const serializedAttrs: Map<string, Coder> | undefined = (this.constructor as any)
        ._serializedAttributes;
      if (serializedAttrs?.has(name)) {
        const expected: string | undefined = (
          this.constructor as any
        )._serializedExpectedTypes?.get(name);
        if (expected && raw !== null && raw !== undefined) {
          // Validate the raw parsed value BEFORE the coder coerces it.
          // The coders silently coerce (e.g. ARRAY_CODER returns [] for non-arrays),
          // so checking after load() would be dead code.
          let parsed: unknown = raw;
          if (typeof raw === "string") {
            try {
              parsed = JSON.parse(raw);
            } catch {
              // unparseable string — let the coder handle it
            }
          }
          if (parsed !== null && parsed !== undefined) {
            const actualType = Array.isArray(parsed)
              ? "Array"
              : typeof parsed === "object"
                ? "Hash"
                : typeof parsed;
            if (expected === "Array" && !Array.isArray(parsed)) {
              throw new SerializationTypeMismatch(
                `Attribute was supposed to be a Array, but was a ${actualType}.`,
              );
            }
            if (expected === "Hash" && (typeof parsed !== "object" || Array.isArray(parsed))) {
              throw new SerializationTypeMismatch(
                `Attribute was supposed to be a Hash, but was a ${actualType}.`,
              );
            }
          }
        }
        return serializedAttrs.get(name)!.load(raw);
      }
      return raw;
    };
  }
}
