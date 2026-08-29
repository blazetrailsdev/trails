import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Human } from "./human.js";
import type { Interest } from "./interest.js";
import { Base } from "../../base.js";

export class Zine extends Base {
  declare interests: AssociationProxy<Interest>;
  declare polymorphicHumans: AssociationProxy<Human>;
  declare title: string;

  static {
    this.hasMany("interests", { inverseOf: "zine" });
    this.hasMany("polymorphicHumans", { through: "interests", sourceType: "Human" });
  }
}
