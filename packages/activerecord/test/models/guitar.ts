import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { AssociationProxy } from "../../lib/associations/collection-proxy.js";
import type { TuningPeg } from "./tuning-peg.js";
import { Base } from "../../lib/base.js";

export class Guitar extends Base {
  declare tuningPegs: AssociationProxy<TuningPeg>;
  declare color: string;

  static {
    this.hasMany("tuningPegs", { indexErrors: true });
    this.acceptsNestedAttributesFor("tuningPegs");
  }
}
constSet(TopLevel, "Guitar", Guitar);
DescendantsTracker.registerSubclass(Base, Guitar);
