import type { Base } from "./base.js";
import { ActiveRecordError } from "./errors.js";
import { classAttribute, include, included } from "@blazetrails/activesupport";
import { union } from "@blazetrails/ruby-compat";
import { writeAttribute as _writeAttributeSuper } from "./attribute-methods/write.js";
import { raiseOnAssignToAttrReadonly } from "./active-record.js";

export class ReadonlyAttributeError extends ActiveRecordError {
  /** @noRailsEquivalent PERMANENT */
  constructor(attribute: string) {
    super(attribute);
    this.name = "ActiveRecord::ReadonlyAttributeError";
  }
}

export const ReadonlyAttributes = {
  [included](base: object): void {
    classAttribute.call(base, "_attrReadonly", { instanceAccessor: false, default: [] });
  },
};

export function attrReadonly(this: typeof Base, ...attributes: string[]): void {
  this._attrReadonly = union(this._attrReadonly, attributes.map(String));
  if (raiseOnAssignToAttrReadonly()) {
    include(this as unknown as new (...args: any[]) => any, HasReadonlyAttributes);
  }
}

export function readonlyAttributes(this: typeof Base): string[] {
  return this._attrReadonly;
}

export function isReadonlyAttribute(this: typeof Base, name: string): boolean {
  return this._attrReadonly.includes(name);
}

export function writeAttribute(this: Base, attrName: string, value: unknown): void {
  const ctor = this.constructor as typeof Base;
  if (this._newRecord === false && ctor.isReadonlyAttribute(String(attrName))) {
    throw new ReadonlyAttributeError(String(attrName));
  }

  _writeAttributeSuper.call(this as never, attrName, value);
}

export function _writeAttribute(this: Base, attrName: string, value: unknown): void {
  const ctor = this.constructor as typeof Base;
  if (this._newRecord === false && ctor.isReadonlyAttribute(String(attrName))) {
    throw new ReadonlyAttributeError(String(attrName));
  }
  this._attributes.writeFromUser(attrName, value);
}

export const HasReadonlyAttributes = {
  writeAttribute,
  _writeAttribute,
};

export const ClassMethods = {
  attrReadonly,
  isReadonlyAttribute,
};
