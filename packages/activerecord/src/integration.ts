/**
 * Cache key and URL param generation for ActiveRecord models.
 *
 * Mirrors: ActiveRecord::Integration
 */

import { Temporal } from "@blazetrails/activesupport/temporal";
import { MissingAttributeError } from "@blazetrails/activemodel";
import { squish, parameterize, truncate } from "@blazetrails/activesupport";
import { getDefaultTimezone } from "./type/internal/timezone.js";

interface Identifiable {
  id: unknown;
  isNewRecord(): boolean;
  readAttribute(name: string): unknown;
  _readAttribute(name: string): unknown;
  readAttributeBeforeTypeCast(name: string): unknown;
  cameFromUser(name: string): boolean;
}

// ──────────────────────────────────────────────
// Timestamp formatting  (mirrors Time#to_fs)
// ──────────────────────────────────────────────

type TemporalTimestamp = Temporal.Instant;

// Mirrors: Time#to_fs(:usec) → "YYYYMMDDHHMMSSuuuuuu" (20 chars)
// Temporal has microsecond precision; the last 3 digits are microseconds (not zeros).
function toFsUsec(ts: TemporalTimestamp): string {
  const dt = ts.toZonedDateTimeISO("UTC");
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
  const dt = ts.toZonedDateTimeISO("UTC");
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
  // Mirrors Rails timestamp.rb:163-167 — reads `timestamp_attributes_for_update_in_model`,
  // which maps updated_at/updated_on through `attribute_aliases` to the real
  // column (e.g. Developer's updated_at → legacy_updated_at) before reading.
  const aliases: Record<string, string> = (record.constructor as any)?._attributeAliases ?? {};
  const candidates: TemporalTimestamp[] = [];
  for (const name of ["updated_at", "updated_on"] as const) {
    const col = aliases[name] ?? name;
    if (record.hasAttribute?.(col)) {
      const val = record._readAttribute(col);
      if (val instanceof Temporal.Instant) {
        candidates.push(val);
      }
    }
  }
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (Temporal.Instant.compare(a, b) >= 0 ? a : b));
}

/**
 * Returns a stable cache key. When cache_versioning is on, excludes the
 * timestamp (use cache_version for that). When off, embeds the timestamp.
 *
 * Mirrors: ActiveRecord::Integration#cache_key
 */
export function cacheKey(this: Identifiable): string {
  const klass = this.constructor as any;
  // Rails keys on `model_name.cache_key` (ActiveModel::Name#cache_key, the
  // underscored/pluralized/namespace-preserving collection key), not the table
  // name — so a model whose table is overridden (e.g. CachedDeveloper,
  // `self.table_name = "developers"`) still keys on `cached_developers`.
  const modelKey: string = klass.name ? klass.modelName.cacheKey : klass.tableName;
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
    // Mirrors Rails integration.rb:100-107. Fast path: when `updated_at` is
    // still the raw DB string (not type-cast, not user-assigned),
    // canUseFastCacheVersion reformats it WITHOUT invoking the `updated_at`
    // type-casting reader. Only user-assigned values fall through to the
    // alias-aware reader (so models aliasing updated_at to a real column
    // still resolve their cache version).
    const raw = this.readAttributeBeforeTypeCast("updated_at");
    if (canUseFastCacheVersion(this, raw)) {
      return rawTimestampToCacheVersion(raw as string);
    }
    const val = this.readAttribute("updated_at");
    if (val instanceof Temporal.Instant) {
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
    // Rails `send(method_name)` resolves to the attribute reader for column
    // names; fall back to readAttribute when no generated accessor is present.
    let member = this[methodName];
    if (member === undefined && typeof this.readAttribute === "function") {
      member = this.readAttribute(methodName);
    }
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

// Matches DB timestamp strings in the form "YYYY-MM-DD HH:MM:SS" or
// "YYYY-MM-DD HH:MM:SS.ffffff" — the only shapes rawTimestampToCacheVersion
// can reliably strip-and-pad to a 20-char usec key. Rails relies on the
// connection returning microsecond (≤6 fractional digit) strings; some trails
// adapters serialize timestamps with sub-microsecond precision (e.g. SQLite
// stores nanoseconds), which rawTimestampToCacheVersion would NOT truncate
// (Rails' helper only pads, never trims), yielding a >20-char key. Capping the
// fractional part at 6 digits keeps the fast path only when it produces the
// same value the type-casting reader would; longer strings fall through to it.
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?$/;

/**
 * Returns true when the raw DB timestamp string can be converted directly
 * to a cache version without re-parsing (fast path). Checks: string type,
 * usec format, default_timezone == utc, not user-assigned, and expected DB
 * timestamp shape. Rails reads the timezone via
 * `with_connection(&:default_timezone) == :utc`; trails reads it synchronously
 * from the process-wide `getDefaultTimezone()` (kept in lockstep with the
 * connection's configured `default_timezone` by `establishConnection`), which
 * realizes Rails' own FIXME to cache this rather than checking out a connection.
 * When default_timezone is not UTC, the raw DB string can't be reused verbatim,
 * so we fall through to the type-casting reader. The `!updated_at_came_from_user?`
 * guard IS implemented (cameFromUser is sync), so a user-assigned DB-format
 * string (e.g. `record.updated_at = "2020-01-01 00:00:00"`) also correctly
 * falls through to the type-casting reader. The shape check (TIMESTAMP_RE) is an
 * additional trails-only safeguard against sub-microsecond raw strings.
 *
 * Mirrors: ActiveRecord::Integration#can_use_fast_cache_version? (private)
 *
 * @internal
 */
export function canUseFastCacheVersion(record: Identifiable, timestamp: unknown): boolean {
  if (typeof timestamp !== "string") return false;
  const klass = record.constructor as any;
  if ((klass.cacheTimestampFormat ?? "usec") !== "usec") return false;
  if (getDefaultTimezone() !== "utc") return false;
  if (record.cameFromUser("updated_at")) return false;
  return TIMESTAMP_RE.test(timestamp);
}

/**
 * Convert a raw DB timestamp string (e.g. "2018-10-15 20:02:15.266505") to a
 * compact 20-character cache version string, padding with trailing zeros if
 * Postgres truncated them.
 *
 * Mirrors: ActiveRecord::Integration#raw_timestamp_to_cache_version (private)
 *
 * @internal
 */
export function rawTimestampToCacheVersion(timestamp: string): string {
  const key = timestamp.replace(/[-: .]/g, "");
  return key.length < 20 ? key.padEnd(20, "0") : key;
}
