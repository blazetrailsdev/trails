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
  record: any,
  options: SerializeOptions = {},
): Record<string, unknown> {
  const attrs: Map<string, unknown> = record._attributes ?? new Map();
  let keys = Array.from(attrs.keys());

  if (options.only) {
    keys = keys.filter((k) => options.only!.includes(k));
  } else if (options.except) {
    keys = keys.filter((k) => !options.except!.includes(k));
  }

  const result: Record<string, unknown> = {};
  for (const key of keys) {
    result[key] = attrs.get(key);
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
          result[assocName] = cached.map((r: any) => serializableHash(r, assocOpts));
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
