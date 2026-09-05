import { ParameterFilter, TimeWithZone, toFs } from "@blazetrails/activesupport";
import { rbInspect as inspect } from "@blazetrails/ruby-compat";
import { toFs as dateToFs } from "@blazetrails/activesupport/core-ext/date/conversions";
import { Temporal, Time as RubyTime } from "@blazetrails/date";

/** @internal */
export class InspectionMask {
  private _value: string = ParameterFilter.FILTERED;

  toString(): string {
    return this._value;
  }

  inspect(): string {
    return this._value;
  }

  toJSON(): string {
    return this._value;
  }
}

const INSPECTION_MASK = new InspectionMask();

interface CoreHost {
  name: string;
  _filterAttributes?: (string | RegExp | ((key: string, value: unknown) => unknown))[];
  _inspectionFilter?: any;
  prototype: any;
}

function parentClass(klass: CoreHost): CoreHost | null {
  const proto = Object.getPrototypeOf(klass);
  return typeof proto === "function" ? (proto as CoreHost) : null;
}

export function inspectionFilter(this: CoreHost): ParameterFilter {
  if (this._inspectionFilter) return this._inspectionFilter;
  if (!Object.prototype.hasOwnProperty.call(this, "_filterAttributes")) {
    const parent = parentClass(this);
    if (parent) return inspectionFilter.call(parent);
  }
  this._inspectionFilter = new ParameterFilter(this._filterAttributes ?? [], {
    mask: INSPECTION_MASK,
  });
  return this._inspectionFilter;
}

const bigintReplacer = (_k: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);

function inspectArray(arr: unknown[]): string {
  return `[${arr
    .map((v) => {
      if (v == null) return "nil";
      if (globalThis.Array.isArray(v)) return inspectArray(v as unknown[]);
      if (typeof v === "bigint") return String(v);
      try {
        return JSON.stringify(v, bigintReplacer) ?? String(v);
      } catch {
        return String(v);
      }
    })
    .join(", ")}]`;
}

export function formatForInspect(this: any, name: string, value: unknown): string {
  if (value === null || value === undefined) {
    return "nil";
  } else {
    let inspectedValue: string;
    if (typeof value === "string" && value.length > 50) {
      inspectedValue = inspect(`${value.substring(0, 50)}...`);
    } else if (value instanceof Temporal.PlainDate) {
      inspectedValue = `"${dateToFs(value, "inspect")}"`;
    } else if (value instanceof Temporal.Instant || value instanceof RubyTime) {
      inspectedValue = `"${toFs(value, "inspect")}"`;
    } else if (value instanceof TimeWithZone) {
      inspectedValue = `"${value.toFs("inspect")}"`;
      // boundary: legacy custom-typed attributes may still be JS Date.
    } else if (value instanceof Date) {
      inspectedValue = Number.isNaN(value.getTime())
        ? `"${String(value)}"`
        : `"${value.toISOString()}"`;
    } else if (typeof value === "string") {
      inspectedValue = inspect(value);
    } else if (globalThis.Array.isArray(value)) {
      inspectedValue = inspectArray(value as unknown[]);
    } else {
      try {
        const stringified = JSON.stringify(value);
        inspectedValue = stringified === undefined ? String(value) : stringified;
      } catch {
        inspectedValue = String(value);
      }
    }

    const filtered = inspectionFilter.call(this.constructor).filterParam(name, inspectedValue);
    return filtered instanceof InspectionMask ? filtered.toString() : String(filtered);
  }
}
