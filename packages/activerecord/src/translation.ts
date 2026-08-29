import type { Base } from "./base.js";
import { isBaseClass } from "./inheritance.js";

export function i18nScope(this: typeof Base): string {
  return "activerecord";
}

export function lookupAncestors(this: typeof Base): Array<typeof Base> {
  let klass: typeof Base = this;
  const classes: Array<typeof Base> = [klass];
  if (Object.prototype.hasOwnProperty.call(klass, "_isActiveRecordBase")) return classes;

  while (!isBaseClass(klass)) {
    klass = Object.getPrototypeOf(klass) as typeof Base;
    classes.push(klass);
  }
  return classes;
}

export const ClassMethods = {
  lookupAncestors,
};
