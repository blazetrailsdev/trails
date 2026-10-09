import { rbClassSuperclass } from "@blazetrails/ruby-compat";
import type { Base } from "./base.js";
import { ActiveRecord } from "./namespaces.js";

export function lookupAncestors(this: typeof Base): Array<typeof Base> {
  let klass: typeof Base = this;
  const classes: Array<typeof Base> = [klass];
  if (klass === ActiveRecord.Base) return classes;

  while (!klass.isBaseClass()) {
    classes.push((klass = rbClassSuperclass(klass)!));
  }
  return classes;
}

export const Translation = {
  lookupAncestors,
  get i18nScope(): string {
    return "activerecord";
  },
};
