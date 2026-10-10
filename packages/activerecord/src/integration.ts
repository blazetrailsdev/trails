import { type Time as RubyTime } from "@blazetrails/date";
import { MissingAttributeError } from "@blazetrails/activemodel";
import { rbFSend, rbModDefineMethod, rbObjAsString } from "@blazetrails/ruby-compat";
import {
  classAttribute,
  included,
  isPresent,
  kernelArray,
  squish,
  parameterize,
  truncate,
} from "@blazetrails/activesupport";
import { defaultTimezone } from "./active-record.js";

interface Identifiable {
  id: unknown;
  isNewRecord(): boolean;
  readAttribute(name: string): unknown;
  _readAttribute(name: string): unknown;
  readAttributeBeforeTypeCast(name: string): unknown;
  hasAttribute(name: string): boolean;
  attributeCameFromUser(name: string): boolean;
  cacheVersion(): string | null;
  canUseFastCacheVersion(timestamp: unknown): boolean;
  maxUpdatedColumnTimestamp(): RubyTime | null;
  readonly modelName: { cacheKey: string };
  readonly cacheTimestampFormat: "usec" | "number";
  readonly cacheVersioning: boolean;
  constructor: { name: string; paramDelimiter: string; hasAttribute(name: string): boolean };
}

export function toParam(this: Identifiable): string | null {
  if (this.id == null || this.id === false) return null;
  return kernelArray(this.id).join(this.constructor.paramDelimiter);
}

export function cacheKey(this: Identifiable): string {
  if (this.isNewRecord()) {
    return `${this.modelName.cacheKey}/new`;
  } else {
    if (this.cacheVersion() != null) {
      return `${this.modelName.cacheKey}/${rbObjAsString(this.id)}`;
    } else {
      const timestamp = this.maxUpdatedColumnTimestamp();

      if (timestamp != null) {
        return `${this.modelName.cacheKey}/${rbObjAsString(this.id)}-${timestamp.utc().toFs(this.cacheTimestampFormat)}`;
      } else {
        return `${this.modelName.cacheKey}/${rbObjAsString(this.id)}`;
      }
    }
  }
}

export function cacheVersion(this: Identifiable): string | null {
  if (!this.cacheVersioning) return null;

  if (this.hasAttribute("updated_at")) {
    let timestamp = this.readAttributeBeforeTypeCast("updated_at");
    if (this.canUseFastCacheVersion(timestamp)) {
      return rawTimestampToCacheVersion(timestamp as string);
    } else if ((timestamp = this.readAttribute("updated_at")) != null) {
      return (timestamp as RubyTime).utc().toFs(this.cacheTimestampFormat);
    }
  } else if (this.constructor.hasAttribute("updated_at")) {
    throw new MissingAttributeError(`missing attribute 'updated_at' for ${this.constructor.name}`);
  }
  return null;
}

export function cacheKeyWithVersion(this: Identifiable): string {
  const base = cacheKey.call(this);
  const version = cacheVersion.call(this);
  return version ? `${base}-${version}` : base;
}

export interface Integration {
  readonly cacheTimestampFormat: "usec" | "number";
  readonly cacheVersioning: boolean;
  readonly collectionCacheVersioning: boolean;
}

export const Integration = {
  [included](base: object): void {
    classAttribute.call(base, "cacheTimestampFormat", { instanceWriter: false, default: "usec" });
    classAttribute.call(base, "cacheVersioning", { instanceWriter: false, default: false });
    classAttribute.call(base, "collectionCacheVersioning", {
      instanceWriter: false,
      default: false,
    });
  },
};

export const ClassMethods = {
  toParam(this: { name: string; prototype: any }, methodName?: string): string | undefined {
    if (methodName == null) {
      return this.name;
    }
    const klass = this;
    rbModDefineMethod(klass, "toParam", function (this: any): string | null {
      let default_: string | null;
      let result: string;
      let param: string;
      if (
        (default_ = Object.getPrototypeOf(klass.prototype).toParam.call(this)) != null &&
        isPresent((result = rbObjAsString(rbFSend(this, methodName)))) &&
        isPresent(
          (param = truncate(parameterize(squish(result)), 20, { separator: /-/, omission: "" })),
        )
      ) {
        return `${default_}-${param}`;
      } else {
        return default_;
      }
    });
    return undefined;
  },
};

export function collectionCacheKey(
  this: { all(): any },
  collection?: any,
  timestampColumn = "updated_at",
): Promise<string> {
  const rel = collection ?? this.all();
  return Promise.resolve(rel.computeCacheKey(timestampColumn));
}

/**
 * @internal
 * @missingRailsCall with_connection — CONVERGEABLE cache-version-fast-path-reads-global-default-timezone
 */
export function canUseFastCacheVersion(this: Identifiable, timestamp: unknown): boolean {
  return (
    typeof timestamp === "string" &&
    this.cacheTimestampFormat === "usec" &&
    defaultTimezone() === "utc" &&
    !this.attributeCameFromUser("updated_at")
  );
}

/** @internal */
export function rawTimestampToCacheVersion(timestamp: string): string {
  const key = timestamp.replace(/[-: .]/g, "");
  return key.length < 20 ? key.padEnd(20, "0") : key;
}
