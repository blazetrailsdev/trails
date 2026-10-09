import { ValueType } from "@blazetrails/activemodel";
import { actsLike, zone as timeZone } from "@blazetrails/activesupport";
import {
  type DateOrTime,
  inTimeZone,
} from "@blazetrails/activesupport/core-ext/date-and-time/zones";
import { type Time as RubyTime } from "@blazetrails/date";
import { classAttribute, included } from "@blazetrails/activesupport";
import {
  ArgumentError,
  DelegateClass,
  rbEqual,
  rbObjRespondTo,
  registerConstant,
  rtest,
} from "@blazetrails/ruby-compat";
import { AttributeMethods } from "../namespaces.js";
type ValueTypeInstance = InstanceType<typeof ValueType>;

interface TimeValueSubtype extends ValueType {
  userInputInTimeZone(value: unknown): unknown;
}

export interface TimeZoneConversion {
  timeZoneAwareAttributes: boolean;
  skipTimeZoneConversionForAttributes: string[];
  timeZoneAwareTypes: string[];
}

interface TimeZoneConversionIncludeHost {
  name: string;
}

export const TimeZoneConversion = {
  [included](base: TimeZoneConversionIncludeHost): void {
    classAttribute.call(base, "timeZoneAwareAttributes", {
      instanceWriter: false,
      default: false,
    });
    classAttribute.call(base, "skipTimeZoneConversionForAttributes", {
      instanceWriter: false,
      default: [],
    });
    classAttribute.call(base, "timeZoneAwareTypes", {
      instanceWriter: false,
      default: ["datetime", "time"],
    });
  },
};

export class TimeZoneConverter extends DelegateClass(ValueType) {
  constructor(subtype: ValueType) {
    if (subtype instanceof TimeZoneConverter) return subtype;
    super(subtype);
  }

  override deserialize(value: unknown): unknown {
    return this.convertTimeToTimeZone(super.deserialize(value));
  }

  override cast(value: unknown): unknown {
    if (value == null) return null;
    const subtype = this.__getobj__() as TimeValueSubtype;
    if (isPlainObject(value)) {
      return setTimeZoneWithoutConversion(super.cast(value));
    } else if (typeof value === "string" || rbObjRespondTo(value, "inTimeZone")) {
      try {
        const casted = super.cast(subtype.userInputInTimeZone(value));
        return rtest(casted) ? casted : super.cast(value);
      } catch (e) {
        if (e instanceof ArgumentError) return null;
        throw e;
      }
    } else if (isInfinite(value)) {
      return value;
    } else {
      return this.map(super.cast(value), (v) => this.cast(v));
    }
  }

  override equals(other: ValueType): boolean {
    return other instanceof TimeZoneConverter && rbEqual(this.__getobj__(), other.__getobj__());
  }

  private convertTimeToTimeZone(value: unknown): unknown {
    if (value == null) return null;

    if (actsLike.call(value, "time")) {
      return inTimeZone(value as DateOrTime);
    } else if (isInfinite(value)) {
      return value;
    } else {
      return this.map(value, (v) => this.convertTimeToTimeZone(v));
    }
  }
}

/** @internal */
function isInfinite(value: unknown): boolean {
  const fn = (value as { isInfinite?: unknown }).isInfinite;
  if (typeof fn === "function") {
    const result = (fn as () => unknown).call(value);
    return result != null && result !== false;
  }
  return value === Infinity || value === -Infinity;
}

/** @internal */
function setTimeZoneWithoutConversion(value: unknown): unknown {
  if (value == null || value === false) return null;
  const utc = timeZone()!.localToUtc(value as RubyTime);
  return utc == null ? null : inTimeZone(utc as DateOrTime);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

interface TimeZoneConversionHost {
  timeZoneAwareAttributes: boolean;
  skipTimeZoneConversionForAttributes: string[];
  timeZoneAwareTypes: string[];
  /** @internal */
  _hookAttributeType?(name: string, castType: unknown): unknown;
}

/** @internal */
export function hookAttributeType(
  this: TimeZoneConversionHost,
  name: string,
  castType: ValueType,
): ValueType {
  if (isCreateTimeZoneConversionAttribute.call(this, name, castType)) {
    return new TimeZoneConverter(castType);
  }
  return castType;
}

/** @internal */
function isCreateTimeZoneConversionAttribute(
  this: TimeZoneConversionHost,
  name: string,
  castType: ValueType,
): boolean {
  const enabledForColumn =
    this.timeZoneAwareAttributes && !this.skipTimeZoneConversionForAttributes.includes(name as any);
  return (
    enabledForColumn &&
    (this.timeZoneAwareTypes ?? ["datetime", "time"]).includes(castType.type() ?? "")
  );
}

AttributeMethods.TimeZoneConversion = TimeZoneConversion;

registerConstant(
  "ActiveRecord::AttributeMethods::TimeZoneConversion::TimeZoneConverter",
  TimeZoneConverter,
);
