// vendor/rails/activerecord/test/models/squeak.rb
import { Base } from "../../base.js";
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";

export class Squeak extends Base {
  static {
    this.belongsTo("mouse");
  }
}

acceptsNestedAttributesFor(Squeak, "mouse");
