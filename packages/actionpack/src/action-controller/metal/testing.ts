import { Module, rbModConstSet } from "@blazetrails/ruby-compat";
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

export const Testing = new Module() as Module & { Functional: typeof Functional };
rbModConstSet(ActionController, "Testing", Testing);

export const Functional = new Module((mod) => {
  mod.defineMethod("clearInstanceVariablesBetweenRequests", clearInstanceVariablesBetweenRequests);
  mod.defineMethod("recycleBang", recycleBang);
});

rbModConstSet(Testing, "Functional", Functional);
