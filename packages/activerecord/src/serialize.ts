import type { Base } from "./base.js";

interface Coder {
  dump(value: unknown): string;
  load(raw: unknown): unknown;
}

const JSON_CODER: Coder = {
  dump(value: unknown): string {
    return JSON.stringify(value);
  },
  load(raw: unknown): unknown {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    }
    return raw;
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
  options: { coder?: "json" | "array" | "hash" | Coder } = {},
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

  // Store the coder config on the class
  if (!(modelClass as any)._serializedAttributes) {
    (modelClass as any)._serializedAttributes = new Map();
  }
  (modelClass as any)._serializedAttributes.set(attribute, coder);

  // Override writeAttribute to serialize before storing
  const originalWrite = modelClass.prototype.writeAttribute;
  const originalRead = modelClass.prototype.readAttribute;

  // Wrap the readAttribute to deserialize
  if (!(modelClass as any)._serializeWrapped) {
    (modelClass as any)._serializeWrapped = true;

    modelClass.prototype.readAttribute = function (name: string): unknown {
      const raw = originalRead.call(this, name);
      const serializedAttrs: Map<string, Coder> | undefined = (this.constructor as any)
        ._serializedAttributes;
      if (serializedAttrs?.has(name)) {
        return serializedAttrs.get(name)!.load(raw);
      }
      return raw;
    };
  }
}
