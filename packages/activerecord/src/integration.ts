/**
 * Cache key and URL param generation for ActiveRecord models.
 *
 * Mirrors: ActiveRecord::Integration
 */

import { MissingAttributeError } from "@blazetrails/activemodel";

interface Identifiable {
  id: unknown;
  isNewRecord(): boolean;
  readAttribute(name: string): unknown;
  _readAttribute(name: string): unknown;
}

/**
 * Returns the id as a string for URL params.
 *
 * Mirrors: ActiveRecord::Integration#to_param
 */
export function toParam(this: Identifiable): string | null {
  const pk = this.id;
  return pk != null ? String(pk) : null;
}

/**
 * Return a cache key suitable for use in key/value stores.
 *
 * Mirrors: ActiveRecord::Integration#cache_key
 */
export function cacheKey(this: Identifiable): string {
  const modelKey = (this.constructor as any).tableName as string;
  const pk = this.id;
  if (this.isNewRecord()) {
    return `${modelKey}/new`;
  }
  return `${modelKey}/${pk}`;
}

/**
 * Return a cache key with version based on updated_at.
 *
 * Mirrors: ActiveRecord::Integration#cache_key_with_version
 */
export function cacheKeyWithVersion(this: Identifiable): string {
  const base = cacheKey.call(this);
  const version = cacheVersion.call(this);
  return version ? `${base}-${version}` : base;
}

/**
 * Return cache version (typically the updated_at timestamp).
 *
 * Mirrors: ActiveRecord::Integration#cache_version
 */
export function cacheVersion(this: Identifiable): string | null {
  if ((this as any).hasAttribute?.("updated_at")) {
    const updatedAt = this._readAttribute("updated_at");
    if (updatedAt instanceof Date) {
      return updatedAt.toISOString().replace(/[^0-9]/g, "");
    }
    return null;
  } else if ((this.constructor as any).hasAttribute?.("updated_at")) {
    throw new MissingAttributeError(
      `missing attribute 'updated_at' for ${(this.constructor as any).name}`,
    );
  }
  return null;
}

/**
 * Rails: collection.send(:compute_cache_key, timestamp_column)
 * Note: timestampColumn is accepted for API parity but Relation#computeCacheKey
 * does not yet support it — will take effect when that's implemented.
 *
 * Mirrors: ActiveRecord::Integration::ClassMethods#collection_cache_key
 */
export function collectionCacheKey(
  this: { all(): any },
  collection?: any,
  _timestampColumn = "updated_at",
): string {
  const rel = collection ?? this.all();
  if (typeof rel.computeCacheKey === "function") {
    return rel.computeCacheKey();
  }
  if (typeof rel.cacheKey === "function") {
    return rel.cacheKey();
  }
  return "";
}
