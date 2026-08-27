import { ParameterFilter } from "@blazetrails/activesupport";

export class InspectionMask {
  private _value: string;

  constructor(value: string = "[FILTERED]") {
    this._value = value;
  }

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
  if (value === null || value === undefined) return "nil";
  const filter = inspectionFilter.call(this.constructor);
  const filtered = filter.filterParam(name, value);
  if (filtered instanceof InspectionMask) return filtered.toString();
  if (filtered === null || filtered === undefined) return "nil";
  if (typeof filtered === "string") {
    return filtered.length > 50 ? `"${filtered.substring(0, 50)}..."` : `"${filtered}"`;
  }
  // boundary: legacy custom-typed attributes may still be JS Date.
  if (filtered instanceof Date) {
    return Number.isNaN(filtered.getTime())
      ? `"${String(filtered)}"`
      : `"${filtered.toISOString()}"`;
  }
  if (globalThis.Array.isArray(filtered)) {
    return inspectArray(filtered as unknown[]);
  }
  try {
    const stringified = JSON.stringify(filtered);
    return stringified === undefined ? String(filtered) : stringified;
  } catch {
    return String(filtered);
  }
}
