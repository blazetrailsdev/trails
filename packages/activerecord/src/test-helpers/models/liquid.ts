// vendor/rails/activerecord/test/models/liquid.rb
import { Base } from "../../base.js";

export class Liquid extends Base {
  static _tableName = "liquid";

  static {
    this.hasMany("molecules", { scope: (q: any) => q.distinct() });
  }
}
