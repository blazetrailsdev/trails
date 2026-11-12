import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { AssociationProxy } from "../../lib/associations/collection-proxy.js";
import type { Squeak } from "./squeak.js";
import { Base } from "../../lib/base.js";

export class Mouse extends Base {
  declare squeaks: AssociationProxy<Squeak>;
  declare name: string;

  static {
    this.hasMany("squeaks", { autosave: true });
    this.validates("name", { presence: true });
  }
}
constSet(TopLevel, "Mouse", Mouse);
DescendantsTracker.registerSubclass(Base, Mouse);
