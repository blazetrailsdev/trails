/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include` (contact.rb:3-7); the class/interface merge is how `include()` surfaces those members on the type side. */
import { InstanceVariablesObject, exceptBang, extend, include } from "@blazetrails/activesupport";
import { Conversion, ClassMethods as ConversionClassMethods } from "../../conversion.js";
import { Naming } from "../../naming.js";
import type { ModelName } from "../../naming.js";
import { Validations } from "../../validations.js";
import { JSON as SerializersJSON } from "../../serializers/json.js";

export interface Contact extends Conversion, Validations, SerializersJSON {}

export class Contact {
  declare static modelName: ModelName;
  declare static includeRootInJson: boolean | string;
  declare static paramDelimiter: string;

  static {
    extend(this, Naming);
    include(this, Conversion);
    extend(this, ConversionClassMethods);
    include(this, Validations);

    include(this, SerializersJSON);
  }

  declare private _id: unknown;
  declare private _name: unknown;
  declare private _age: unknown;
  declare private _createdAt: unknown;
  declare private _awesome: unknown;
  declare private _preferences: unknown;
  declare private _address: unknown;
  declare private _friends: unknown;
  declare private _contact: unknown;

  get id(): unknown {
    return this._id;
  }

  set id(value: unknown) {
    this._id = value;
  }

  get name(): unknown {
    return this._name;
  }

  set name(value: unknown) {
    this._name = value;
  }

  get age(): unknown {
    return this._age;
  }

  set age(value: unknown) {
    this._age = value;
  }

  get createdAt(): unknown {
    return this._createdAt;
  }

  set createdAt(value: unknown) {
    this._createdAt = value;
  }

  get awesome(): unknown {
    return this._awesome;
  }

  set awesome(value: unknown) {
    this._awesome = value;
  }

  get preferences(): unknown {
    return this._preferences;
  }

  set preferences(value: unknown) {
    this._preferences = value;
  }

  get address(): unknown {
    return this._address;
  }

  set address(value: unknown) {
    this._address = value;
  }

  get friends(): unknown {
    return this._friends;
  }

  set friends(value: unknown) {
    this._friends = value;
  }

  get contact(): unknown {
    return this._contact;
  }

  set contact(value: unknown) {
    this._contact = value;
  }

  social(): string[] {
    return ["twitter", "github"];
  }

  network(): Record<string, string> {
    return { git: ":github" };
  }

  constructor(options: Record<string, unknown> = {}) {
    for (const [name, value] of Object.entries(options)) {
      (this as unknown as Record<string, unknown>)[name] = value;
    }
  }

  pseudonyms(): null {
    return null;
  }

  isPersisted(): boolean {
    return this.id != null && this.id !== false;
  }

  setAttributes(hash: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(hash)) {
      (this as unknown as Record<string, unknown>)[`_${k}`] = v;
    }
  }

  get attributes(): Record<string, unknown> {
    return exceptBang(instanceValues(this), "address", "friends", "contact");
  }
}

function instanceValues(contact: Contact): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(InstanceVariablesObject.instanceValues(contact)).map(([ivar, value]) => [
      ivar.replace(/^_/, ""),
      value,
    ]),
  );
}
