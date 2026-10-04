import { AttributeAssignmentError, MultiparameterAssignmentErrors } from "./errors.js";
import { eachValue, isEmpty, rbInspect, rbStrToF, rbStrToI } from "@blazetrails/ruby-compat";

interface AttributeAssignmentHost {
  writeAttribute(key: string, value: unknown): void;
  attributeWriterMissing(name: string, value: unknown): void;
  /** @internal */
  _assignAttribute(k: string, v: unknown): unknown;
  readAttribute(name: string): unknown;
  /** @internal */
  assignNestedParameterAttributes(pairs: Record<string, unknown>): Promise<void> | void;
  /** @internal */
  assignMultiparameterAttributes(pairs: Record<string, unknown>): void;
}

function isNestedParameterHash(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * @internal
 * @inventedArm if — CONVERGEABLE assign-attributes-pending-promise-chain-arms
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
      pending = pending.then(async () => {
        await this._assignAttribute(key, v);
      });
    } else {
      const assigned = this._assignAttribute(key, v);
      if (assigned instanceof Promise) pending = assigned;
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
 * @inventedArm if — CONVERGEABLE assign-attributes-pending-promise-chain-arms
 */
export function assignNestedParameterAttributes(
  this: AttributeAssignmentHost,
  pairs: Record<string, unknown>,
): Promise<void> | void {
  let pending: Promise<void> | undefined;
  for (const [k, v] of Object.entries(pairs)) {
    if (pending) {
      pending = pending.then(async () => {
        await this._assignAttribute(k, v);
      });
    } else {
      const assigned = this._assignAttribute(k, v);
      if (assigned instanceof Promise) pending = assigned;
    }
  }
  return pending;
}

/** @internal */
export function assignMultiparameterAttributes(
  this: AttributeAssignmentHost,
  pairs: Record<string, unknown>,
): void {
  const callstack = extractCallstackForMultiparameterAttributes.call(this, pairs);
  executeCallstackForMultiparameterAttributes.call(this, callstack);
}

/** @internal */
export function executeCallstackForMultiparameterAttributes(
  this: AttributeAssignmentHost,
  callstack: Record<string, Record<number, unknown>>,
): void {
  const errors: AttributeAssignmentError[] = [];
  for (const [name, valuesWithEmptyParameters] of Object.entries(callstack)) {
    let values: Record<number, unknown> | null;
    try {
      if (eachValue(valuesWithEmptyParameters).isAll((v) => v == null)) {
        values = null;
      } else {
        values = valuesWithEmptyParameters;
      }
      (this as unknown as Record<string, unknown>)[name] = values;
    } catch (ex) {
      errors.push(
        new AttributeAssignmentError(
          `error on assignment ${rbInspect(Object.values(valuesWithEmptyParameters))} to ${name} (${(ex as Error).message})`,
          ex as Error,
          name,
        ),
      );
    }
  }
  if (errors.length !== 0) {
    const errorDescriptions = errors.map((e) => e.message).join(",");
    const error = new MultiparameterAssignmentErrors(errors);
    error.message = `${errors.length} error(s) on assignment of multiparameter attributes [${errorDescriptions}]`;
    throw error;
  }
}

/** @internal */
export function extractCallstackForMultiparameterAttributes(
  this: AttributeAssignmentHost,
  pairs: Record<string, unknown>,
): Record<string, Record<number, unknown>> {
  const attributes: Record<string, Record<number, unknown>> = {};

  for (const [multiparameterName, value] of Object.entries(pairs)) {
    const attributeName = multiparameterName.split("(")[0];
    attributes[attributeName] ??= {};

    const parameterValue = isEmpty(value as string)
      ? null
      : typeCastAttributeValue(multiparameterName, value as string);
    attributes[attributeName][findParameterPosition(multiparameterName)] ??= parameterValue;
  }

  return attributes;
}

/** @internal */
export function typeCastAttributeValue(multiparameterName: string, value: string): unknown {
  const md = /\([0-9]*([if])\)/.exec(multiparameterName);
  return md ? { i: rbStrToI, f: rbStrToF }[md[1] as "i" | "f"](value) : value;
}

/** @internal */
export function findParameterPosition(multiparameterName: string): number {
  return rbStrToI([...multiparameterName.matchAll(/\(([0-9]*).*\)/g)][0][1]) as number;
}

export const AttributeAssignment = {
  _assignAttributes,
  assignNestedParameterAttributes,
  assignMultiparameterAttributes,
  executeCallstackForMultiparameterAttributes,
  extractCallstackForMultiparameterAttributes,
  typeCastAttributeValue,
  findParameterPosition,
};
