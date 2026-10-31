import {
  ArgumentError,
  NameError,
  NoMethodError,
  NotImplementedError,
  RuntimeError,
  TypeError,
  eachPair,
  isEmpty,
  rbFSend,
  rbObjClassname,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";
import { UnknownAttributeError } from "./errors.js";

export function assignAttributes(this: AttributeAssignment, newAttributes: unknown): void {
  if (!respondToEachPair(newAttributes)) {
    throw new ArgumentError(
      `When assigning attributes, you must pass a hash as an argument, ${rbObjClassname(newAttributes)} passed.`,
    );
  }
  const capture = assignmentCapture;
  assignmentCapture = null;
  if (isEmpty(newAttributes)) return;

  const host = this as unknown as Record<symbol, boolean | undefined>;
  const outer = host[assigningSynchronously];
  host[assigningSynchronously] = true;
  try {
    const assigned = this._assignAttributes(this.sanitizeForMassAssignment(newAttributes));
    if (capture == null) {
      assertAssignedSynchronously(assigned, "assignAttributes");
    } else if (assigned instanceof Promise) {
      void assigned.catch(() => {});
      capture.assigned = assigned;
    }
  } finally {
    host[assigningSynchronously] = outer;
  }
}

interface AssignmentCapture {
  assigned?: Promise<void>;
}

let assignmentCapture: AssignmentCapture | null = null;

export const assigningSynchronously: unique symbol = Symbol.for(
  "@blazetrails/activemodel:assigningSynchronously",
);

/** @internal */
export function _assignAttributes(
  this: AttributeAssignment,
  attributes: Record<string, unknown> | Map<string, unknown>,
): void {
  eachPair(attributes, (k, v) => {
    void this._assignAttribute(k, v);
  });
}

export function setAttributes(
  this: AttributeAssignment,
  newAttributes: unknown,
): Promise<void> | void {
  if (!respondToEachPair(newAttributes)) {
    throw new ArgumentError(
      `When assigning attributes, you must pass a hash as an argument, ${rbObjClassname(newAttributes)} passed.`,
    );
  }
  if (isEmpty(newAttributes)) return;

  return this._assignAttributes(this.sanitizeForMassAssignment(newAttributes));
}

export function attributeWriterMissing(
  this: AttributeAssignment,
  name: string,
  _value: unknown,
): void {
  throw new UnknownAttributeError(this, name);
}

/** @internal */
export function _assignAttribute(this: AttributeAssignment, k: string, v: unknown): unknown {
  const setter = `${k}=`;
  try {
    return rbFSend(this, setter, v);
  } catch (error) {
    if (!(error instanceof NoMethodError)) throw error;
    if (rbObjRespondTo(this, setter)) {
      throw error;
    } else {
      this.attributeWriterMissing(k, v);
    }
  }
}

export interface AttributeAssignment {
  attributeWriterMissing(name: string, value: unknown): void;
  /** @internal */
  sanitizeForMassAssignment(
    attributes: Record<string, unknown> | Map<string, unknown>,
  ): Record<string, unknown> | Map<string, unknown>;
  /** @internal */
  _assignAttributes(
    attributes: Record<string, unknown> | Map<string, unknown>,
  ): Promise<void> | void;
  /** @internal */
  _assignAttribute(k: string, v: unknown): unknown;
}

function respondToEachPair(
  attrs: unknown,
): attrs is Record<string, unknown> | Map<string, unknown> {
  if (typeof attrs !== "object" || attrs === null || Array.isArray(attrs)) return false;
  const proto = Object.getPrototypeOf(attrs);
  if (proto === Object.prototype || proto === null || attrs instanceof Map) return true;
  return isParamsLikeWrapper(attrs);
}

function isParamsLikeWrapper(attrs: object): boolean {
  if (typeof attrs !== "object" || attrs === null) return false;
  const proto = Object.getPrototypeOf(attrs);
  if (proto === Object.prototype || proto === null) return false;
  const wrapper = attrs as { isPermitted?: unknown; toH?: unknown };
  return "isPermitted" in wrapper || typeof wrapper.toH === "function";
}

export { ArgumentError, TypeError, NameError, NoMethodError, NotImplementedError, RuntimeError };

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE update-must-call-assign-attributes-carried-from-0087
 */
export function assertAssignedSynchronously(pending: unknown, methodName: string): void {
  if (!(pending instanceof Promise)) return;
  void pending.catch(() => {});
  throw new RuntimeError(
    `${methodName} cannot assign this attribute synchronously; use \`await record.setAttributes(...)\` instead.`,
  );
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export async function awaitingAssignment<R, K = never>(
  attributes: unknown,
  block: ((record: K) => void | Promise<void>) | undefined,
  build: (block?: (record: K) => void) => R,
): Promise<R> {
  const capture: AssignmentCapture = {};
  let yielded: unknown;
  if (attributes != null) assignmentCapture = capture;
  let record: R;
  try {
    record = build(
      block &&
        ((record: K) => {
          yielded = capture.assigned ? capture.assigned.then(() => block(record)) : block(record);
        }),
    );
  } finally {
    assignmentCapture = null;
  }
  await yielded;
  await capture.assigned;
  return record;
}
