/**
 * Cache key and URL param generation for ActiveRecord models.
 *
 * Mirrors: ActiveRecord::Integration
 */

import { NotImplementedError } from "./errors.js";
import { Temporal } from "@blazetrails/activesupport/temporal";
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

type TemporalTimestamp = Temporal.Instant | Temporal.PlainDateTime;

// Mirrors: Time#to_fs(:usec) → "YYYYMMDDHHMMSSuuuuuu" (20 chars)
// Temporal has microsecond precision; the last 3 digits are microseconds (not zeros).
function toFsUsec(ts: TemporalTimestamp): string {
  const dt =
    ts instanceof Temporal.Instant ? ts.toZonedDateTimeISO("UTC") : (ts as Temporal.PlainDateTime);
  const y = dt.year.toString().padStart(4, "0");
  const mo = dt.month.toString().padStart(2, "0");
  const d = dt.day.toString().padStart(2, "0");
  const h = dt.hour.toString().padStart(2, "0");
  const mi = dt.minute.toString().padStart(2, "0");
  const s = dt.second.toString().padStart(2, "0");
  const us = (dt.millisecond * 1000 + dt.microsecond).toString().padStart(6, "0");
  return `${y}${mo}${d}${h}${mi}${s}${us}`;
}

// Mirrors: Time#to_fs(:number) → "YYYYMMDDHHMMSS" (14 chars)
function toFsNumber(ts: TemporalTimestamp): string {
  const dt =
    ts instanceof Temporal.Instant ? ts.toZonedDateTimeISO("UTC") : (ts as Temporal.PlainDateTime);
  const y = dt.year.toString().padStart(4, "0");
  const mo = dt.month.toString().padStart(2, "0");
  const d = dt.day.toString().padStart(2, "0");
  const h = dt.hour.toString().padStart(2, "0");
  const mi = dt.minute.toString().padStart(2, "0");
  const s = dt.second.toString().padStart(2, "0");
  return `${y}${mo}${d}${h}${mi}${s}`;
}

type CacheTimestampFormat = "usec" | "number";

function formatTimestamp(ts: TemporalTimestamp, format: CacheTimestampFormat | string): string {
  if (format === "number") return toFsNumber(ts);
  if (format !== "usec") {
    throw new Error(
      `Unknown cacheTimestampFormat: ${JSON.stringify(format)}. Supported values: "usec", "number".`,
    );
  }
  return toFsUsec(ts);
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
function maxUpdatedColumnTimestamp(record: any): TemporalTimestamp | null {
  const candidates: TemporalTimestamp[] = [];
  for (const col of ["updated_at", "updated_on"] as const) {
    if (record.hasAttribute?.(col)) {
      const val = record._readAttribute(col);
      if (val instanceof Temporal.Instant || val instanceof Temporal.PlainDateTime) {
        candidates.push(val);
      }
    }
  }
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => {
    if (a instanceof Temporal.Instant && b instanceof Temporal.Instant) {
      return Temporal.Instant.compare(a, b) >= 0 ? a : b;
    }
    if (a instanceof Temporal.PlainDateTime && b instanceof Temporal.PlainDateTime) {
      return Temporal.PlainDateTime.compare(a, b) >= 0 ? a : b;
    }
    return a; // mixed types shouldn't occur; keep first
  });
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
    if (val instanceof Temporal.Instant || val instanceof Temporal.PlainDateTime) {
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

function canUseFastCacheVersion(timestamp: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Integration#can_use_fast_cache_version? is not implemented",
  );
}

function rawTimestampToCacheVersion(timestamp: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Integration#raw_timestamp_to_cache_version is not implemented",
  );
}
