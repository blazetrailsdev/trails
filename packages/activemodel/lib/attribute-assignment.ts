import { ArgumentError } from "@blazetrails/ruby-compat/argument-error";
import { eachPair } from "@blazetrails/ruby-compat/hash";
import { NameError } from "@blazetrails/ruby-compat/name-error";
import { NoMethodError } from "@blazetrails/ruby-compat/no-method-error";
import { NotImplementedError } from "@blazetrails/ruby-compat/not-implemented-error";
import { rbFSend, rbObjClassname, rbObjRespondTo } from "@blazetrails/ruby-compat/object";
import { isEmpty } from "@blazetrails/ruby-compat/ruby-empty";
import { RuntimeError } from "@blazetrails/ruby-compat/runtime-error";
import { TypeError } from "@blazetrails/ruby-compat/type-error";
import { UnknownAttributeError } from "./errors.js";

export function assignAttributes(this: AttributeAssignment, newAttributes: unknown): void {
  if (!respondToEachPair(newAttributes)) {
    throw new ArgumentError(
      `When assigning attributes, you must pass a hash as an argument, ${rbObjClassname(newAttributes)} passed.`,
    );
  }
  const capture =
    assignmentCapture?.attributes === newAttributes || assignmentCapture?.attributes === undefined
      ? assignmentCapture
      : null;
  if (capture != null) {
    assignmentCapture = null;
    pendingCaptures.set(this, capture);
  }
  if (isEmpty(newAttributes)) return;

  const outer = this[assigningSynchronously];
  this[assigningSynchronously] = capture == null;
  try {
    const assigned = this._assignAttributes(this.sanitizeForMassAssignment(newAttributes));
    if (capture == null) {
      assertAssignedSynchronously(assigned, "assignAttributes");
    } else if (assigned instanceof Promise) {
      capture.assigned = assigned;
    }
  } finally {
    this[assigningSynchronously] = outer;
  }
}

interface AssignmentCapture {
  attributes: unknown;
  assigned?: Promise<void>;
}

let assignmentCapture: AssignmentCapture | null = null;
const pendingCaptures = new WeakMap<object, AssignmentCapture>();

export const assigningSynchronously: unique symbol = Symbol.for(
  "@blazetrails/activemodel:assigningSynchronously",
);

/** @internal */
export function _assignAttributes(
  this: AttributeAssignment,
  attributes: Record<string, unknown> | Map<string, unknown>,
): Promise<void> | void {
  let pending: Promise<unknown> | undefined;
  eachPair(attributes, (k, v) => {
    if (pending !== undefined) {
      pending = pending.then(() => this._assignAttribute(k, v));
      return;
    }
    const assigned = this._assignAttribute(k, v);
    if (assigned instanceof Promise) pending = assigned;
  });
  if (pending !== undefined) return pending.then(() => {});
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
  [assigningSynchronously]?: boolean;
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
  const error = new RuntimeError(
    `${methodName} cannot assign this attribute synchronously; use \`await record.setAttributes(...)\` instead.`,
  );
  pending.catch((reason: unknown) => {
    error.cause = reason;
  });
  throw error;
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function capturingAssignment<R>(build: () => R): [R, Promise<void> | undefined] {
  const capture: AssignmentCapture = { attributes: undefined };
  assignmentCapture = capture;
  try {
    const record = build();
    return [record, capture.assigned];
  } catch (error) {
    capture.assigned?.catch((reason: unknown) => {
      if (error instanceof Error) error.cause ??= reason;
    });
    throw error;
  } finally {
    assignmentCapture = null;
  }
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function deferringToAssignment(record: object, rest: () => unknown): boolean {
  const capture = pendingCaptures.get(record);
  if (capture === undefined) return false;
  pendingCaptures.delete(record);
  if (capture.assigned === undefined) {
    const rested = rest();
    if (rested instanceof Promise) capture.assigned = rested.then(() => {});
  } else {
    capture.assigned = capture.assigned.then(rest).then(() => {});
  }
  return true;
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export async function awaitingAssignment<R, K = never>(
  attributes: unknown,
  block: ((record: K) => void | Promise<void>) | undefined,
  build: (block?: (record: K) => unknown) => R,
): Promise<R> {
  const capture: AssignmentCapture = { attributes };
  let yielded: unknown;
  if (attributes != null) assignmentCapture = capture;
  let record: R;
  try {
    record = build(
      block &&
        ((record: K) => {
          yielded = block(record);
          if (yielded instanceof Promise && capture.assigned === undefined) {
            capture.assigned = yielded;
          }
          return yielded;
        }),
    );
  } finally {
    assignmentCapture = null;
  }
  await capture.assigned;
  await yielded;
  return record;
}

export const AttributeAssignment = {
  assignAttributes,
  attributeWriterMissing,
  _assignAttributes,
  _assignAttribute,
};
