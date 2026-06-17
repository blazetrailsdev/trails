import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { TuningPeg } from "./tuning-peg.js";
// vendor/rails/activerecord/test/models/guitar.rb
import { Base } from "../../base.js";
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";

export class Guitar extends Base {
  declare tuningPegs: AssociationProxy<TuningPeg>;
  declare color: string;

  static {
    this.hasMany("tuningPegs", { indexErrors: true });
  }
}

acceptsNestedAttributesFor(Guitar, "tuningPegs");
