// vendor/rails/activerecord/test/models/toy.rb
import { Base } from "../../base.js";

export class Toy extends Base {
  static _primaryKey = "toy_id";

  static {
    this.belongsTo("pet");
    this.hasMany("sponsors", { as: "sponsorable", inverseOf: "sponsorable" });
    this.scope("withPet", (q: any) => q.joins("pet"));
  }
}
