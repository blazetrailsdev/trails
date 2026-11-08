/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include` (address.rb:4); the class/interface merge is how `include()` surfaces those members on the type side. */
import { InstanceVariablesObject, include } from "@blazetrails/activesupport";
import { JSON as SerializersJSON } from "../../serializers/json.js";

export interface Address extends SerializersJSON {}

export class Address {
  static {
    include(this, SerializersJSON);
  }

  declare private _addressLine: unknown;
  declare private _city: unknown;
  declare private _state: unknown;
  declare private _country: unknown;

  get addressLine(): unknown {
    return this._addressLine;
  }

  set addressLine(value: unknown) {
    this._addressLine = value;
  }

  get city(): unknown {
    return this._city;
  }

  set city(value: unknown) {
    this._city = value;
  }

  get state(): unknown {
    return this._state;
  }

  set state(value: unknown) {
    this._state = value;
  }

  get country(): unknown {
    return this._country;
  }

  set country(value: unknown) {
    this._country = value;
  }

  constructor(options: Record<string, unknown> = {}) {
    for (const [name, value] of Object.entries(options)) {
      (this as unknown as Record<string, unknown>)[name] = value;
    }
  }

  get attributes(): Record<string, unknown> {
    return instanceValues(this);
  }
}

function instanceValues(address: Address): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(InstanceVariablesObject.instanceValues(address)).map(([ivar, value]) => [
      ivar.replace(/^_/, ""),
      value,
    ]),
  );
}
