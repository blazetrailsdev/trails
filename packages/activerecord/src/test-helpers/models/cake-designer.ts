import type { Chef } from "./chef.js";
// vendor/rails/activerecord/test/models/cake_designer.rb
import { Base } from "../../base.js";

export class CakeDesigner extends Base {
  declare chef: Chef | null;
  declare loadHasOne: (name: "chef") => Promise<Chef | null>;

  static {
    this.hasOne("chef", { as: "employable" });
  }
}
