/**
 * Shared inspection helpers used by both Core and AttributeMethods.
 * Extracted into a separate module to break the core ↔ attribute-methods
 * circular dependency.
 */

import { ParameterFilter } from "@blazetrails/activesupport";

/**
 * Placeholder used in inspect output when an attribute value is masked.
 *
 * Mirrors: ActiveRecord::Core::InspectionMask
 */
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

/**
 * Rails: creates an ActiveSupport::ParameterFilter with an InspectionMask.
 * Delegates up the class hierarchy if no own filterAttributes are set.
 *
 * Mirrors: ActiveRecord::Core#inspection_filter
 */
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

/**
 * Format a single attribute value for inspect output.
 * Shared implementation used by Core#inspect, Core#attribute_for_inspect,
 * and AttributeMethods#format_for_inspect.
 *
 * Mirrors: ActiveRecord::AttributeMethods#format_for_inspect
 */
export function formatForInspect(this: any, name: string, value: unknown): string {
  if (value === null || value === undefined) return "nil";
  const filter = inspectionFilter.call(this.constructor);
  const filtered = filter.filterParam(name, value);
  if (filtered instanceof InspectionMask) return filtered.toString();
  if (filtered === null || filtered === undefined) return "nil";
  if (typeof filtered === "string") {
    return filtered.length > 50 ? `"${filtered.substring(0, 50)}..."` : `"${filtered}"`;
  }
  if (filtered instanceof Date) return `"${filtered.toISOString()}"`;
  try {
    const stringified = JSON.stringify(filtered);
    return stringified === undefined ? String(filtered) : stringified;
  } catch {
    return String(filtered);
  }
}
