import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { MissingAttributeError } from "@blazetrails/activemodel";
import { NoMethodError } from "@blazetrails/ruby-compat";
import { isPresent, squish, parameterize, toFs, truncate } from "@blazetrails/activesupport";
import { defaultTimezone } from "./active-record.js";

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

export const ClassMethods = {
  /** @missingRailsCall define_method — PERMANENT */
  toParam(this: { name: string; prototype: any }, methodName?: string): string | undefined {
    if (methodName == null) {
      return this.name;
    }
    const klass = this;
    klass.prototype.toParam = function (this: any): string | null {
      let default_: string | null;
      let result: string;
      let param: string;
      if (
        (default_ = Object.getPrototypeOf(klass.prototype).toParam?.call(this) ?? null) != null &&
        isPresent((result = String(publicSend(this, methodName) ?? ""))) &&
        isPresent(
          (param = truncate(parameterize(squish(result)), 20, { separator: /-/, omission: "" })),
        )
      ) {
        return `${default_}-${param}`;
      } else {
        return default_;
      }
    };
    return undefined;
  },
};

function publicSend(obj: object, method: string): unknown {
  if (!(method in obj)) {
    throw new NoMethodError(
      `undefined method '${method}' for an instance of ${obj.constructor.name}`,
    );
  }
  const value = (obj as Record<string, unknown>)[method];
  return value instanceof Function ? (value as () => unknown).call(obj) : value;
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
 * @missingRailsCall with_connection — CONVERGEABLE cache-version-fast-path-reads-global-default-timezone
 */
export function canUseFastCacheVersion(record: Identifiable, timestamp: unknown): boolean {
  if (typeof timestamp !== "string") return false;
  const klass = record.constructor as any;
  if ((klass.cacheTimestampFormat ?? "usec") !== "usec") return false;
  if (defaultTimezone() !== "utc") return false;
  if ((record as unknown as Record<string, boolean>)["updated_atCameFromUser"]) return false;
  return TIMESTAMP_RE.test(timestamp);
}

/** @internal */
export function rawTimestampToCacheVersion(timestamp: string): string {
  const key = timestamp.replace(/[-: .]/g, "");
  return key.length < 20 ? key.padEnd(20, "0") : key;
}
