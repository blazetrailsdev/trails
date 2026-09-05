import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { MissingAttributeError } from "@blazetrails/activemodel";
import { squish, parameterize, toFs, truncate } from "@blazetrails/activesupport";
import { ActiveRecord } from "./ar-config.js";

interface Identifiable {
  id: unknown;
  isNewRecord(): boolean;
  readAttribute(name: string): unknown;
  _readAttribute(name: string): unknown;
  readAttributeBeforeTypeCast(name: string): unknown;
}

type TemporalTimestamp = RubyTime;

export function toParam(this: Identifiable): string | null {
  const pk = this.id;
  if (pk == null) return null;
  const paramDelimiter: string = (this.constructor as any).paramDelimiter ?? "_";
  return Array.isArray(pk) ? pk.join(paramDelimiter) : String(pk);
}

function maxUpdatedColumnTimestamp(record: any): TemporalTimestamp | null {
  const aliases: Record<string, string> = record.constructor?.attributeAliases ?? {};
  const candidates: TemporalTimestamp[] = [];
  for (const name of ["updated_at", "updated_on"] as const) {
    const col = aliases[name] ?? name;
    if (record.hasAttribute?.(col)) {
      const val = record._readAttribute(col);
      if (val instanceof RubyTime) {
        candidates.push(val);
      }
    }
  }
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a.toR().cmp(b.toR()) >= 0 ? a : b));
}

export function cacheKey(this: Identifiable): string {
  const klass = this.constructor as any;
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
    const cacheTimestampFormat: string = klass.cacheTimestampFormat ?? "usec";
    return `${modelKey}/${idStr}-${toFs(timestamp, cacheTimestampFormat)}`;
  }

  return `${modelKey}/${idStr}`;
}

export function cacheVersion(this: Identifiable): string | null {
  const klass = this.constructor as any;
  if (!klass.cacheVersioning) return null;

  if ((this as any).hasAttribute?.("updated_at")) {
    let timestamp = this.readAttributeBeforeTypeCast("updated_at");
    if (canUseFastCacheVersion(this, timestamp)) {
      return rawTimestampToCacheVersion(timestamp as string);
    }
    timestamp = this.readAttribute("updated_at");
    if (timestamp instanceof RubyTime || timestamp instanceof Temporal.Instant) {
      const cacheTimestampFormat: string = klass.cacheTimestampFormat ?? "usec";
      return toFs(timestamp, cacheTimestampFormat);
    }
    return null;
  }

  if (klass.hasAttribute?.("updated_at")) {
    throw new MissingAttributeError(`missing attribute 'updated_at' for ${klass.name}`);
  }

  return null;
}

export function cacheKeyWithVersion(this: Identifiable): string {
  const base = cacheKey.call(this);
  const version = cacheVersion.call(this);
  return version ? `${base}-${version}` : base;
}

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

export function collectionCacheKey(
  this: { all(): any },
  collection?: any,
  timestampColumn = "updated_at",
): Promise<string> {
  const rel = collection ?? this.all();
  return Promise.resolve(rel.computeCacheKey(timestampColumn));
}

const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?$/;

/**
 * @internal
 * @missingRailsCall with_connection — PERMANENT
 */
export function canUseFastCacheVersion(record: Identifiable, timestamp: unknown): boolean {
  if (typeof timestamp !== "string") return false;
  const klass = record.constructor as any;
  if ((klass.cacheTimestampFormat ?? "usec") !== "usec") return false;
  if (ActiveRecord.defaultTimezone !== "utc") return false;
  if ((record as unknown as Record<string, boolean>)["updated_atCameFromUser"]) return false;
  return TIMESTAMP_RE.test(timestamp);
}

/** @internal */
export function rawTimestampToCacheVersion(timestamp: string): string {
  const key = timestamp.replace(/[-: .]/g, "");
  return key.length < 20 ? key.padEnd(20, "0") : key;
}
