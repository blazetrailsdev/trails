import {
  rbObjInstanceVariables,
  rbObjIvarDefined,
  rbObjIvarGet,
  rbObjIvarSet,
  rbObjRemoveInstanceVariable,
} from "@blazetrails/ruby-compat";
import { ActionController } from "../../namespaces.js";
import type { Metal } from "../metal.js";

export function clearInstanceVariablesBetweenRequests(this: Metal): void {
  if (rbObjIvarDefined(this, "@_ivars")) {
    const ivars = rbObjIvarGet(this, "@_ivars") as string[];
    const newIvars = rbObjInstanceVariables(this).filter((ivar) => !ivars.includes(ivar));
    newIvars.forEach((ivar) => rbObjRemoveInstanceVariable(this, ivar));
  }

  rbObjIvarSet(this, "@_ivars", rbObjInstanceVariables(this));
}

export function recycleBang(this: Metal): void {
  rbObjIvarSet(this, "@_url_options", null);
  this.formats = null;
  this.params = null;
}

export const Functional = { clearInstanceVariablesBetweenRequests, recycleBang };

export const Testing = {} as { Functional: typeof Functional };
ActionController.Testing = Testing;

Testing.Functional = Functional;
