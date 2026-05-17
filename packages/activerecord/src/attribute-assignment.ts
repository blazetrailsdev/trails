/**
 * AttributeAssignment — bulk and multiparameter attribute assignment.
 *
 * Mirrors: ActiveRecord::AttributeAssignment
 *
 * Runtime note: the public `assignAttributes` entry-point lives in
 * `persistence.ts` (wired onto Base), which delegates to the helpers in
 * `multiparameter-attribute-assignment.ts`. The functions exported here are
 * the Rails-private layer (`_assign_attributes`, `assign_multiparameter_attributes`,
 * etc.) that Rails' `assign_attributes` calls internally — they exist here for
 * Rails-layout parity (`api:compare`) and are @internal.
 */
import {
  extractMultiparameterCallstack,
  executeMultiparameterAssignment,
} from "./multiparameter-attribute-assignment.js";

interface AttributeAssignmentHost {
  writeAttribute(key: string, value: unknown): void;
  constructor: unknown;
  association?: (name: string) => unknown;
}

/**
 * @internal
 * Mirrors: ActiveRecord::AttributeAssignment#_assign_attributes
 */
export function _assignAttributes(
  this: AttributeAssignmentHost,
  attributes: Record<string, unknown>,
): void {
  let multiParameterAttributes: Record<string, unknown> | null = null;
  let nestedParameterAttributes: Record<string, unknown> | null = null;

  for (const [k, v] of Object.entries(attributes)) {
    if (k.includes("(")) {
      (multiParameterAttributes ??= Object.create(null))[k] = v;
    } else if (assignAssociationIfMatch(this, k, v)) {
      // Routed to association proxy writer (constructor-form collection / singular).
    } else if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      (nestedParameterAttributes ??= Object.create(null))[k] = v;
    } else {
      this.writeAttribute(k, v);
    }
  }

  if (nestedParameterAttributes) {
    assignNestedParameterAttributes.call(
      this,
      nestedParameterAttributes as Record<string, unknown>,
    );
  }
  if (multiParameterAttributes) {
    assignMultiparameterAttributes.call(this, multiParameterAttributes);
  }
}

/**
 * @internal
 * Mirrors: ActiveRecord::AttributeAssignment#assign_nested_parameter_attributes
 */
export function assignNestedParameterAttributes(
  this: AttributeAssignmentHost,
  pairs: Record<string, unknown>,
): void {
  for (const [k, v] of Object.entries(pairs)) {
    this.writeAttribute(k, v);
  }
}

/**
 * @internal
 * Mirrors: ActiveRecord::AttributeAssignment#assign_multiparameter_attributes
 */
export function assignMultiparameterAttributes(
  this: AttributeAssignmentHost,
  pairs: Record<string, unknown>,
): void {
  const callstack = extractCallstackForMultiparameterAttributes.call(this, pairs);
  executeCallstackForMultiparameterAttributes.call(this, callstack);
}

/**
 * @internal
 * Mirrors: ActiveRecord::AttributeAssignment#execute_callstack_for_multiparameter_attributes
 */
export function executeCallstackForMultiparameterAttributes(
  this: AttributeAssignmentHost,
  callstack: Record<string, Record<number, unknown>>,
): void {
  executeMultiparameterAssignment(
    this as Parameters<typeof executeMultiparameterAssignment>[0],
    callstack,
  );
}

/**
 * @internal
 * Mirrors: ActiveRecord::AttributeAssignment#extract_callstack_for_multiparameter_attributes
 */
export function extractCallstackForMultiparameterAttributes(
  this: AttributeAssignmentHost,
  pairs: Record<string, unknown>,
): Record<string, Record<number, unknown>> {
  return extractMultiparameterCallstack(pairs).multiparams;
}

/**
 * @internal
 * Mirrors: ActiveRecord::AttributeAssignment#type_cast_attribute_value
 */
export function typeCastAttributeValue(multiparameterName: string, value: string): unknown {
  const match = multiparameterName.match(/\(\d*([if])\)/);
  if (!match) return value;
  const flag = match[1];
  // Ruby's String#to_i / #to_f return 0 / 0.0 for blank/invalid input.
  if (flag === "i") {
    const n = parseInt(value, 10);
    return isNaN(n) ? 0 : n;
  }
  if (flag === "f") {
    const n = parseFloat(value);
    return isNaN(n) ? 0.0 : n;
  }
  return value;
}

/**
 * @internal
 * Mirrors: ActiveRecord::AttributeAssignment#find_parameter_position
 */
export function findParameterPosition(multiparameterName: string): number {
  const match = multiparameterName.match(/\((\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * @internal
 * Constructor-form association writer. When `key` matches a declared
 * association on the host's constructor, dispatch `value` to the
 * association proxy's `replace`/`writer` rather than `writeAttribute`.
 * Mirrors Rails' `_assign_attribute` routing into association writers.
 */
function assignAssociationIfMatch(
  host: AttributeAssignmentHost,
  key: string,
  value: unknown,
): boolean {
  const ctor = host.constructor as
    | { _associations?: Array<{ name: string; type: string }> }
    | undefined;
  const assoc = ctor?._associations?.find((a) => a.name === key);
  if (!assoc) return false;
  if (typeof host.association !== "function") return false;
  const proxy = host.association(key) as
    | { replace?: (v: unknown[]) => void; writer?: (v: unknown) => void }
    | null
    | undefined;
  if (!proxy) return false;
  if (assoc.type === "hasMany" || assoc.type === "hasAndBelongsToMany") {
    if (typeof proxy.replace !== "function") return false;
    proxy.replace(Array.isArray(value) ? (value as unknown[]) : value == null ? [] : [value]);
    return true;
  }
  if (assoc.type === "hasOne" || assoc.type === "belongsTo") {
    if (typeof proxy.writer !== "function") return false;
    proxy.writer(value);
    return true;
  }
  return false;
}

export const InstanceMethods = {
  _assignAttributes,
  assignNestedParameterAttributes,
  assignMultiparameterAttributes,
  executeCallstackForMultiparameterAttributes,
  extractCallstackForMultiparameterAttributes,
  typeCastAttributeValue,
  findParameterPosition,
};
