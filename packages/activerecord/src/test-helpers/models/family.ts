// vendor/rails/activerecord/test/models/family.rb
import { Base } from "../../base.js";

export class Family extends Base {
  static {
    this.hasMany("familyTrees", { scope: (q: any) => q.where({ token: null }) });
    this.hasMany("members", { through: "familyTrees" });
  }
}
