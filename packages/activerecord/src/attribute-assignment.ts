import {
  extractMultiparameterCallstack,
  executeMultiparameterAssignment,
} from "./multiparameter-attribute-assignment.js";

interface AttributeAssignmentHost {
  writeAttribute(key: string, value: unknown): void;
  attributeWriterMissing(name: string, value: unknown): void;
  /** @internal */
  _assignAttribute(k: string, v: unknown): Promise<void> | void;
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

/** @internal */
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
      pending = pending.then(() => this._assignAttribute(key, v));
    } else {
      pending = this._assignAttribute(key, v) as Promise<void> | undefined;
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

/** @internal */
export function assignNestedParameterAttributes(
  this: AttributeAssignmentHost,
  pairs: Record<string, unknown>,
): Promise<void> | void {
  let pending: Promise<void> | undefined;
  for (const [k, v] of Object.entries(pairs)) {
    pending = (
      pending ? pending.then(() => this._assignAttribute(k, v)) : this._assignAttribute(k, v)
    ) as Promise<void> | undefined;
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
  executeMultiparameterAssignment(
    this as Parameters<typeof executeMultiparameterAssignment>[0],
    callstack,
  );
}

/** @internal */
export function extractCallstackForMultiparameterAttributes(
  this: AttributeAssignmentHost,
  pairs: Record<string, unknown>,
): Record<string, Record<number, unknown>> {
  return extractMultiparameterCallstack(pairs).multiparams;
}

/** @internal */
export function typeCastAttributeValue(multiparameterName: string, value: string): unknown {
  const match = multiparameterName.match(/\(\d*([if])\)/);
  if (!match) return value;
  const flag = match[1];
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

/** @internal */
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
