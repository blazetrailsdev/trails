// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

/**
 * Serialization mixin contract — provides serializable_hash.
 *
 * Mirrors: ActiveModel::Serialization
 */
export interface Serialization {
  serializableHash(options?: SerializeOptions): Record<string, unknown>;
}

/**
 * Serialization options.
 */
export interface SerializeOptions {
  only?: string[];
  except?: string[];
  methods?: string[];
  include?: Record<string, SerializeOptions> | string[] | string;
}

/**
 * Serialize a model's attributes to a plain object.
 *
 * Mirrors: ActiveModel::Serialization#serializable_hash
 */
export function serializableHash(
  record: AnyRecord,
  options: SerializeOptions = {},
): Record<string, unknown> {
  // Get keys without materializing all values
  const attrStore = record._attributes;
  let keys: string[];
  if (attrStore && typeof attrStore.keys === "function" && !(attrStore instanceof Map)) {
    keys = attrStore.keys();
  } else if (attrStore instanceof Map) {
    keys = Array.from(attrStore.keys());
  } else if (record.attributes) {
    keys = Object.keys(record.attributes);
  } else {
    keys = [];
  }

  // Exclude virtual attributes (e.g., acceptance/confirmation) from serialization
  const defs = record.constructor?._attributeDefinitions as
    | Map<string, { virtual?: boolean }>
    | undefined;
  if (defs) {
    keys = keys.filter((k) => !defs.get(k)?.virtual);
  }

  if (options.only) {
    keys = keys.filter((k) => options.only!.includes(k));
  } else if (options.except) {
    keys = keys.filter((k) => !options.except!.includes(k));
  }

  // Read values only for filtered keys
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (attrStore && typeof attrStore.fetchValue === "function") {
      result[key] = attrStore.fetchValue(key);
    } else if (attrStore instanceof Map) {
      result[key] = attrStore.get(key);
    } else if (record.readAttribute) {
      result[key] = record.readAttribute(key);
    } else {
      result[key] = record.attributes?.[key];
    }
  }

  if (options.methods) {
    for (const method of options.methods) {
      if (typeof record[method] === "function") {
        result[method] = record[method]();
      } else if (method in record) {
        result[method] = record[method];
      } else {
        throw new Error(
          `undefined method '${method}' for an instance of ${record.constructor.name}`,
        );
      }
    }
  }

  // Handle include option for nested associations
  if (options.include) {
    const includes = normalizeIncludes(options.include);
    for (const [assocName, assocOpts] of Object.entries(includes)) {
      // Check for cached/preloaded associations
      const cached =
        record._preloadedAssociations?.get(assocName) ?? record._cachedAssociations?.get(assocName);
      if (cached !== undefined) {
        if (Array.isArray(cached)) {
          result[assocName] = cached.map((r: AnyRecord) => serializableHash(r, assocOpts));
        } else if (cached && typeof cached === "object" && cached._attributes) {
          result[assocName] = serializableHash(cached, assocOpts);
        } else {
          result[assocName] = cached;
        }
      }
    }
  }

  return result;
}

function normalizeIncludes(
  include: Record<string, SerializeOptions> | string[] | string,
): Record<string, SerializeOptions> {
  if (typeof include === "string") {
    return { [include]: {} };
  }
  if (Array.isArray(include)) {
    const result: Record<string, SerializeOptions> = {};
    for (const name of include) {
      result[name] = {};
    }
    return result;
  }
  return include;
}
