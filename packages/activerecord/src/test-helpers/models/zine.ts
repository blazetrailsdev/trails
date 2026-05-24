// vendor/rails/activerecord/test/models/zine.rb
import { Base } from "../../base.js";

export class Zine extends Base {
  static {
    this.hasMany("interests", { inverseOf: "zine" });
    this.hasMany("polymorphicHumans", { through: "interests", sourceType: "Human" });
  }
}
