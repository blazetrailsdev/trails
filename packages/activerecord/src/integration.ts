/**
 * Cache key and URL param generation for ActiveRecord models.
 *
 * Mirrors: ActiveRecord::Integration
 */

interface Identifiable {
  id: unknown;
  isNewRecord(): boolean;
  readAttribute(name: string): unknown;
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
  const updatedAt = this.readAttribute("updated_at");
  if (updatedAt instanceof Date) {
    return `${base}-${updatedAt.toISOString().replace(/[^0-9]/g, "")}`;
  }
  return base;
}

/**
 * Return cache version (typically the updated_at timestamp).
 *
 * Mirrors: ActiveRecord::Integration#cache_version
 */
export function cacheVersion(this: Identifiable): string | null {
  const updatedAt = this.readAttribute("updated_at");
  if (updatedAt instanceof Date) {
    return updatedAt.toISOString().replace(/[^0-9]/g, "");
  }
  return null;
}
