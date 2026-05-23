// vendor/rails/activerecord/test/models/cake_designer.rb
import { Base } from "../../base.js";

export class CakeDesigner extends Base {
  static {
    this.hasOne("chef", { as: "employable" });
  }
}
