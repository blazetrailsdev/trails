import {
  ArgumentError,
  NameError,
  NoMethodError,
  NotImplementedError,
  RuntimeError,
  TypeError,
  eachPair,
  isAbsentHalf,
  isEmpty,
  methodCacheSerial,
  rbFSend,
  rbObjClassname,
  rbObjRespondTo,
  writerSpelling,
} from "@blazetrails/ruby-compat";
import { UnknownAttributeError } from "./errors.js";

export function assignAttributes(this: AttributeAssignment, newAttributes: unknown): void {
  if (!respondToEachPair(newAttributes)) {
    throw new ArgumentError(
      `When assigning attributes, you must pass a hash as an argument, ${rbObjClassname(newAttributes)} passed.`,
    );
  }
  if (isEmpty(newAttributes)) return;

  const host = this as unknown as Record<symbol, boolean | undefined>;
  const outer = host[assigningSynchronously];
  host[assigningSynchronously] = true;
  try {
    assertAssignedSynchronously(
      this._assignAttributes(this.sanitizeForMassAssignment(newAttributes)),
      "assignAttributes",
    );
  } finally {
    host[assigningSynchronously] = outer;
  }
}

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

/**
 * @internal
 * @inventedArm if — CONVERGEABLE rbfsend-per-prototype-writer-cache
 * @perf 100ns — CONVERGEABLE rbfsend-per-prototype-writer-cache
 */
export function _assignAttribute(this: AttributeAssignment, k: string, v: unknown): unknown {
  const setter = `${k}=`;
  try {
    const writer = writerSpelling(k);
    const write =
      Object.hasOwn(this, setter) ||
      Object.hasOwn(this, k) ||
      (writer !== undefined && Object.hasOwn(this, writer))
        ? _resolveWriter(this, k, setter)
        : _cachedWriter(Object.getPrototypeOf(this) as object | null, k, setter);
    if (typeof write === "function") return write.call(this, v);
    if (write) {
      (this as unknown as Record<string, unknown>)[k] = v;
      return v;
    }
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

type Writer = ((v: unknown) => unknown) | boolean;

/** @perf 100ns — CONVERGEABLE rbfsend-per-prototype-writer-cache */
let writerCache = new WeakMap<object, Map<string, Writer>>();
let writerCacheSerial = methodCacheSerial;

/** @perf 100ns — CONVERGEABLE rbfsend-per-prototype-writer-cache */
function _cachedWriter(proto: object | null, k: string, setter: string): Writer {
  if (proto === null) return false;
  if (writerCacheSerial !== methodCacheSerial) {
    writerCache = new WeakMap();
    writerCacheSerial = methodCacheSerial;
  }
  let writers = writerCache.get(proto);
  if (writers === undefined) writerCache.set(proto, (writers = new Map()));
  let write = writers.get(k);
  if (write === undefined) writers.set(k, (write = _resolveWriter(proto, k, setter)));
  return write;
}

/** @perf 100ns — CONVERGEABLE rbfsend-per-prototype-writer-cache */
function _resolveWriter(start: object, k: string, setter: string): Writer {
  const writer = writerSpelling(k);
  for (let o: object | null = start; o; o = Object.getPrototypeOf(o)) {
    if (Object.hasOwn(o, setter)) {
      const write = (o as Record<string, unknown>)[setter];
      return typeof write === "function" ? (write as (v: unknown) => unknown) : false;
    }
    if (Object.hasOwn(o, k)) {
      const set = Object.getOwnPropertyDescriptor(o, k)!.set;
      return set !== undefined && !isAbsentHalf(set);
    }
    if (writer !== undefined && Object.hasOwn(o, writer)) return false;
  }
  return false;
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
