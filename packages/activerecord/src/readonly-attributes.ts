import type { Base } from "./base.js";
import { ActiveRecordError } from "./errors.js";
import { ActiveRecord } from "./ar-config.js";
import { include } from "@blazetrails/activesupport";
import { writeAttribute as _writeAttributeSuper } from "./attribute-methods/write.js";

export class ReadonlyAttributeError extends ActiveRecordError {
  readonly attribute: string;
  constructor(attribute: string) {
    super(attribute);
    this.name = "ReadonlyAttributeError";
    this.attribute = attribute;
  }
}

export function attrReadonly(this: typeof Base, ...attributes: string[]): void {
  (this as any)._attrReadonly = [
    ...new Set([...((this as any)._attrReadonly as string[]), ...attributes.map(String)]),
  ];
  if (ActiveRecord.raiseOnAssignToAttrReadonly) {
    include(this as unknown as new (...args: any[]) => any, HasReadonlyAttributes);
  }
}

export function readonlyAttributes(this: typeof Base): string[] {
  return (this as any)._attrReadonly;
}

export function readonlyAttributeQ(this: typeof Base, name: string): boolean {
  return ((this as any)._attrReadonly as string[]).includes(name);
}

export function writeAttribute(this: Base, attrName: string, value: unknown): void {
  const ctor = this.constructor as typeof Base;
  if (this._newRecord === false && ctor.readonlyAttributeQ(String(attrName))) {
    throw new ReadonlyAttributeError(String(attrName));
  }

  _writeAttributeSuper.call(this as never, attrName, value);
}

export function _writeAttribute(this: Base, attrName: string, value: unknown): void {
  const ctor = this.constructor as typeof Base;
  if (this._newRecord === false && ctor.readonlyAttributeQ(String(attrName))) {
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
  readonlyAttributeQ,
};
