import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { TuningPeg } from "./tuning-peg.js";
import { Base } from "../../base.js";

export class Guitar extends Base {
  declare tuningPegs: AssociationProxy<TuningPeg>;
  declare color: string;

  static {
    this.hasMany("tuningPegs", { indexErrors: true });
    this.acceptsNestedAttributesFor("tuningPegs");
  }
}
