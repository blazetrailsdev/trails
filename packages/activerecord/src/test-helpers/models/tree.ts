// vendor/rails/activerecord/test/models/tree.rb
import { Base } from "../../base.js";

export class Tree extends Base {
  static {
    this.hasMany("nodes", { dependent: "destroy" });
  }
}
