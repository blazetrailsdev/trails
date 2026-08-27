import type { AttributeMethod } from "./attribute-methods.js";
import { UnknownAttributeError } from "./errors.js";

export function assignAttributes(
  this: AttributeAssignment,
  newAttributes: unknown,
): Promise<void> | void {
  if (!respondToEachPair(newAttributes)) {
    throw new ArgumentError(
      `When assigning attributes, you must pass a hash as an argument, ${classOf(newAttributes)} passed.`,
    );
  }
  if (isMassAssignmentEmpty(newAttributes)) return;

  return this._assignAttributes(this.sanitizeForMassAssignment(newAttributes));
}

/** @internal */
export function _assignAttributes(
  this: AttributeAssignment,
  attributes: Record<string, unknown>,
): void {
  for (const [k, v] of Object.entries(attributes)) {
    void this._assignAttribute(k, v);
  }
}

export function setAttributes(
  this: AttributeAssignment,
  newAttributes: unknown,
): Promise<void> | void {
  return assignAttributes.call(this, newAttributes);
}

export function attributeWriterMissing(
  this: AttributeAssignment,
  name: string,
  _value: unknown,
): void {
  throw new UnknownAttributeError(this, name);
}

/** @internal */
export function _assignAttribute(
  this: AttributeAssignment,
  k: string,
  v: unknown,
): Promise<void> | void {
  const setter = `${k}=`;
  try {
    const method = publicMethod(this, setter);
    if (method) {
      const result: unknown = method.call(this, v);
      return result instanceof Promise ? (result as Promise<void>) : undefined;
    }
    const match = this.matchedAttributeMethod(setter);
    if (match) {
      this.attributeMissing(match, v);
      return;
    }
    throw new NoMethodError(
      `undefined method '${setter}' for an instance of ${this.constructor.name}`,
    );
  } catch (error) {
    if (!(error instanceof NoMethodError)) throw error;
    if (publicMethod(this, setter)) {
      throw error;
    } else {
      this.attributeWriterMissing(k, v);
    }
  }
}

function publicMethod(
  model: AttributeAssignment,
  setter: string,
): ((this: AttributeAssignment, value: unknown) => unknown) | null {
  const key = setter.slice(0, -1);
  let obj: object | null = model;
  while (obj && obj !== Object.prototype) {
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    if (desc && typeof desc.set === "function") {
      return desc.set as (this: AttributeAssignment, value: unknown) => unknown;
    }
    obj = Object.getPrototypeOf(obj);
  }
  const generated = (model as unknown as Record<string, unknown>)[setter];
  if (typeof generated === "function") {
    return generated as (this: AttributeAssignment, value: unknown) => unknown;
  }
  return null;
}

export interface AttributeAssignment {
  attributeWriterMissing(name: string, value: unknown): void;
  /** @internal */
  sanitizeForMassAssignment(attributes: Record<string, unknown>): Record<string, unknown>;
  /** @internal */
  _assignAttributes(attributes: Record<string, unknown>): Promise<void> | void;
  /** @internal */
  _assignAttribute(k: string, v: unknown): Promise<void> | void;
  matchedAttributeMethod(methodName: string): AttributeMethod | null;
  attributeMissing(match: AttributeMethod, ...args: unknown[]): unknown;
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE
 */
export function isMassAssignmentEmpty(attrs: object): boolean {
  if (isParamsLikeWrapper(attrs)) {
    const empty = (attrs as { empty?: unknown }).empty;
    if (typeof empty === "boolean") return empty;
  }
  return Object.keys(attrs).length === 0;
}

function respondToEachPair(attrs: unknown): attrs is Record<string, unknown> {
  if (typeof attrs !== "object" || attrs === null || Array.isArray(attrs)) return false;
  const proto = Object.getPrototypeOf(attrs);
  if (proto === Object.prototype || proto === null) return true;
  return isParamsLikeWrapper(attrs);
}

function isParamsLikeWrapper(attrs: object): boolean {
  if (typeof attrs !== "object" || attrs === null) return false;
  const proto = Object.getPrototypeOf(attrs);
  if (proto === Object.prototype || proto === null) return false;
  const wrapper = attrs as { permitted?: unknown; toH?: unknown };
  return "permitted" in wrapper || typeof wrapper.toH === "function";
}

function classOf(value: unknown): string {
  if (value === null) return "NilClass";
  if (Array.isArray(value)) return "Array";
  const ctorName = (value as { constructor?: { name?: string } } | undefined)?.constructor?.name;
  if (ctorName) return ctorName;
  const t = typeof value;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

class ArgumentError extends globalThis.Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgumentError";
  }
}

class TypeError extends globalThis.Error {
  constructor(message: string) {
    super(message);
    this.name = "TypeError";
  }
}

class RuntimeError extends globalThis.Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeError";
  }
}

class NameError extends globalThis.Error {
  constructor(message: string) {
    super(message);
    this.name = "NameError";
  }
}

class NoMethodError extends NameError {
  constructor(message: string) {
    super(message);
    this.name = "NoMethodError";
  }
}

class NotImplementedError extends globalThis.Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

export { ArgumentError, TypeError, NameError, NoMethodError, NotImplementedError, RuntimeError };
