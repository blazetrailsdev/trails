import { rbModConstSet } from "@blazetrails/ruby-compat";
import { ActionController } from "../../namespaces.js";

export function clearInstanceVariablesBetweenRequests(this: Record<string, unknown>): void {
  if (Object.hasOwn(this, "_ivars")) {
    const ivars = this._ivars as string[];
    const newIvars = Object.getOwnPropertyNames(this).filter((ivar) => !ivars.includes(ivar));
    for (const ivar of newIvars) delete this[ivar];
  }

  this._ivars = Object.getOwnPropertyNames(this);
}

export function recycleBang(this: Record<string, unknown>): void {
  this._urlOptions = null;
  this.formats = null;
  this.params = null;
}

export const Functional = { clearInstanceVariablesBetweenRequests, recycleBang };

export const Testing = {} as { Functional: typeof Functional };
rbModConstSet(ActionController, "Testing", Testing);

rbModConstSet(Testing, "Functional", Functional);
