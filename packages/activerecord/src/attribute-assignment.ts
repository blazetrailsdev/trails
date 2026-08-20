/**
 * AttributeAssignment — bulk and multiparameter attribute assignment.
 *
 * Mirrors: ActiveRecord::AttributeAssignment
 *
 * Runtime note: as in Rails, `assign_attributes` itself is ActiveModel's
 * (activemodel/attribute_assignment.rb:28-34) and is not redefined here; the
 * functions exported here are the Rails-private layer
 * (`_assign_attributes`, `assign_multiparameter_attributes`, etc.) that it
 * calls internally. They are mixed onto `Base`, so ActiveModel's
 * `assign_attributes` reaches this `_assign_attributes` exactly as Ruby's
 * `self` send does. All are @internal.
 */
import {
  extractMultiparameterCallstack,
  executeMultiparameterAssignment,
} from "./multiparameter-attribute-assignment.js";
import { _assignAttribute } from "./persistence.js";

interface AttributeAssignmentHost {
  writeAttribute(key: string, value: unknown): void;
  attributeWriterMissing(name: string, value: unknown): void;
  readAttribute(name: string): unknown;
  /** @internal */
  assignNestedParameterAttributes(pairs: Record<string, unknown>): Promise<void> | void;
  /** @internal */
  assignMultiparameterAttributes(pairs: Record<string, unknown>): void;
}

/**
 * Ruby `v.is_a?(Hash)` (attribute_assignment.rb:13). A Date/Temporal/model
 * value is `typeof "object"` in JS but is not a Hash in Ruby, so only plain
 * objects may be deferred.
 */
function isNestedParameterHash(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * @internal
 * Mirrors: ActiveRecord::AttributeAssignment#_assign_attributes
 * (attribute_assignment.rb:6-23).
 *
 * Rails buckets multiparameter keys AND Hash values out of the main loop and
 * assigns the nested hashes only after the scalar pass (:21), so a nested
 * writer's `reject_if` / the built record's callbacks observe an owner whose
 * own attributes are already set. Nested runs before multiparameter (:21-22).
 *
 * `pending` is the one accommodation Rails does not need: its `_assign_attribute`
 * has finished writing by the time the loop reaches the next key, so where a send
 * here answers a promise the rest of the loop is chained behind it to keep that
 * order. Every send that stays in memory keeps running inline.
 */
export function _assignAttributes(
  this: AttributeAssignmentHost,
  attributes: Record<string, unknown>,
): Promise<void> | void {
  let multiParameterAttributes: Record<string, unknown> | null = null;
  let nestedParameterAttributes: Record<string, unknown> | null = null;
  let pending: Promise<void> | undefined;

  for (const [k, v] of Object.entries(attributes)) {
    const key = String(k);
    if (key.includes("(")) {
      (multiParameterAttributes ??= {})[key] = v;
    } else if (isNestedParameterHash(v)) {
      (nestedParameterAttributes ??= {})[key] = v;
    } else if (pending) {
      pending = pending.then(() => _assignAttribute(this, key, v));
    } else {
      pending = _assignAttribute(this, key, v) as Promise<void> | undefined;
    }
  }

  const assignDeferred = (): Promise<void> | void => {
    const nested = (
      nestedParameterAttributes
        ? this.assignNestedParameterAttributes(nestedParameterAttributes)
        : undefined
    ) as Promise<void> | undefined;
    const assignMulti = (): void => {
      if (multiParameterAttributes) this.assignMultiparameterAttributes(multiParameterAttributes);
    };
    return nested ? nested.then(assignMulti) : assignMulti();
  };

  return pending ? pending.then(assignDeferred) : assignDeferred();
}

/**
 * @internal
 * Mirrors: ActiveRecord::AttributeAssignment#assign_nested_parameter_attributes
 * (attribute_assignment.rb:26-28) — assign any deferred nested attributes after
 * the base attributes have been set.
 */
export function assignNestedParameterAttributes(
  this: AttributeAssignmentHost,
  pairs: Record<string, unknown>,
): Promise<void> | void {
  let pending: Promise<void> | undefined;
  for (const [k, v] of Object.entries(pairs)) {
    pending = (
      pending ? pending.then(() => _assignAttribute(this, k, v)) : _assignAttribute(this, k, v)
    ) as Promise<void> | undefined;
  }
  return pending;
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

export const InstanceMethods = {
  _assignAttributes,
  assignNestedParameterAttributes,
  assignMultiparameterAttributes,
  executeCallstackForMultiparameterAttributes,
  extractCallstackForMultiparameterAttributes,
  typeCastAttributeValue,
  findParameterPosition,
};
