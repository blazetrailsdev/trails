/**
 * Cache key and URL param generation for ActiveRecord models.
 *
 * Mirrors: ActiveRecord::Integration
 */

import { MissingAttributeError } from "@blazetrails/activemodel";
import { squish, parameterize, truncate } from "@blazetrails/activesupport";

interface Identifiable {
  id: unknown;
  isNewRecord(): boolean;
  readAttribute(name: string): unknown;
  _readAttribute(name: string): unknown;
}

// ──────────────────────────────────────────────
// Timestamp formatting  (mirrors Time#to_fs)
// ──────────────────────────────────────────────

// Mirrors: Time#to_fs(:usec) → "YYYYMMDDHHMMSSuuuuuu" (20 chars)
// JS Date has ms precision; pad the 3 sub-ms digits with zeros.
function toFsUsec(date: Date): string {
  const y = date.getUTCFullYear().toString().padStart(4, "0");
  const mo = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = date.getUTCDate().toString().padStart(2, "0");
  const h = date.getUTCHours().toString().padStart(2, "0");
  const mi = date.getUTCMinutes().toString().padStart(2, "0");
  const s = date.getUTCSeconds().toString().padStart(2, "0");
  const ms = date.getUTCMilliseconds().toString().padStart(3, "0");
  return `${y}${mo}${d}${h}${mi}${s}${ms}000`;
}

// Mirrors: Time#to_fs(:number) → "YYYYMMDDHHMMSS" (14 chars)
function toFsNumber(date: Date): string {
  const y = date.getUTCFullYear().toString().padStart(4, "0");
  const mo = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = date.getUTCDate().toString().padStart(2, "0");
  const h = date.getUTCHours().toString().padStart(2, "0");
  const mi = date.getUTCMinutes().toString().padStart(2, "0");
  const s = date.getUTCSeconds().toString().padStart(2, "0");
  return `${y}${mo}${d}${h}${mi}${s}`;
}

type CacheTimestampFormat = "usec" | "number";

function formatTimestamp(date: Date, format: CacheTimestampFormat | string): string {
  if (format === "number") return toFsNumber(date);
  if (format !== "usec") {
    throw new Error(
      `Unknown cacheTimestampFormat: ${JSON.stringify(format)}. Supported values: "usec", "number".`,
    );
  }
  return toFsUsec(date);
}

// ──────────────────────────────────────────────
// to_param helpers
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
// Instance methods
// ──────────────────────────────────────────────

/**
 * Returns a string suitable for use in URLs.
 * For composite primary keys, joins with param_delimiter (default "_").
 *
 * Mirrors: ActiveRecord::Integration#to_param
 */
export function toParam(this: Identifiable): string | null {
  const pk = this.id;
  if (pk == null) return null;
  const delimiter: string = (this.constructor as any).paramDelimiter ?? "_";
  return Array.isArray(pk) ? pk.join(delimiter) : String(pk);
}

/**
 * Returns the max of updated_at / updated_on as a Date, or null.
 *
 * Mirrors: ActiveRecord::Integration#max_updated_column_timestamp
 */
function maxUpdatedColumnTimestamp(record: any): Date | null {
  const candidates: Date[] = [];
  for (const col of ["updated_at", "updated_on"] as const) {
    if (record.hasAttribute?.(col)) {
      const val = record._readAttribute(col);
      if (val instanceof Date) candidates.push(val);
    }
  }
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a >= b ? a : b));
}

/**
 * Returns a stable cache key. When cache_versioning is on, excludes the
 * timestamp (use cache_version for that). When off, embeds the timestamp.
 *
 * Mirrors: ActiveRecord::Integration#cache_key
 */
export function cacheKey(this: Identifiable): string {
  const klass = this.constructor as any;
  const modelKey: string = klass.tableName;
  const pk = this.id;

  if (this.isNewRecord()) {
    return `${modelKey}/new`;
  }

  const delimiter: string = klass.paramDelimiter ?? "_";
  const idStr = Array.isArray(pk) ? pk.join(delimiter) : String(pk);

  if (klass.cacheVersioning) {
    return `${modelKey}/${idStr}`;
  }

  const timestamp = maxUpdatedColumnTimestamp(this);
  if (timestamp) {
    const fmt: string = klass.cacheTimestampFormat ?? "usec";
    return `${modelKey}/${idStr}-${formatTimestamp(timestamp, fmt)}`;
  }

  return `${modelKey}/${idStr}`;
}

/**
 * Returns the cache version (timestamp string) when cache_versioning is on.
 *
 * Mirrors: ActiveRecord::Integration#cache_version
 */
export function cacheVersion(this: Identifiable): string | null {
  const klass = this.constructor as any;
  if (!klass.cacheVersioning) return null;

  if ((this as any).hasAttribute?.("updated_at")) {
    const val = this._readAttribute("updated_at");
    if (val instanceof Date) {
      const fmt: string = klass.cacheTimestampFormat ?? "usec";
      return formatTimestamp(val, fmt);
    }
    return null;
  }

  if (klass.hasAttribute?.("updated_at")) {
    throw new MissingAttributeError(`missing attribute 'updated_at' for ${klass.name}`);
  }

  return null;
}

/**
 * Returns a cache key along with the version.
 *
 * Mirrors: ActiveRecord::Integration#cache_key_with_version
 */
export function cacheKeyWithVersion(this: Identifiable): string {
  const base = cacheKey.call(this);
  const version = cacheVersion.call(this);
  return version ? `${base}-${version}` : base;
}

// ──────────────────────────────────────────────
// Class methods
// ──────────────────────────────────────────────

/**
 * Called with no argument: returns the class name (Module#to_param in Ruby).
 * Called with a method name: defines an instance #to_param that returns
 * "id-parameterized-value" (truncated to 20 chars at a word boundary).
 *
 * Mirrors: ActiveRecord::Integration::ClassMethods#to_param
 */
export function toParamClass(
  this: { name: string; prototype: any },
  methodName?: string,
): string | undefined {
  if (methodName === undefined) {
    return this.name;
  }
  const klass = this;
  klass.prototype.toParam = function (this: any): string | null {
    const base: string | null = Object.getPrototypeOf(klass.prototype).toParam?.call(this) ?? null;
    if (!base) return base;
    const member = this[methodName];
    const raw: string = String((typeof member === "function" ? member.call(this) : member) ?? "");
    const slug = truncate(parameterize(squish(raw)), 20, { separator: /-/, omission: "" });
    return slug ? `${base}-${slug}` : base;
  };
  return undefined;
}

/**
 * Mirrors: ActiveRecord::Integration::ClassMethods#collection_cache_key
 */
export function collectionCacheKey(
  this: { all(): any },
  collection?: any,
  timestampColumn = "updated_at",
): Promise<string> {
  const rel = collection ?? this.all();
  if (typeof rel.cacheKey === "function") {
    return Promise.resolve(rel.cacheKey(timestampColumn));
  }
  return Promise.resolve("");
}
