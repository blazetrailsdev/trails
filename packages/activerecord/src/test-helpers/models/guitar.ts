// vendor/rails/activerecord/test/models/guitar.rb
import { Base } from "../../base.js";
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";

export class Guitar extends Base {
  static {
    this.hasMany("tuningPegs", { indexErrors: true });
  }
}

acceptsNestedAttributesFor(Guitar, "tuningPegs");
