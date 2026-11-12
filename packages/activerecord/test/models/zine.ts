import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { AssociationProxy } from "../../lib/associations/collection-proxy.js";
import type { Human } from "./human.js";
import type { Interest } from "./interest.js";
import { Base } from "../../lib/base.js";

export class Zine extends Base {
  declare interests: AssociationProxy<Interest>;
  declare polymorphicHumans: AssociationProxy<Human>;
  declare title: string;

  static {
    this.hasMany("interests", { inverseOf: "zine" });
    this.hasMany("polymorphicHumans", { through: "interests", sourceType: "Human" });
  }
}
constSet(TopLevel, "Zine", Zine);
DescendantsTracker.registerSubclass(Base, Zine);
