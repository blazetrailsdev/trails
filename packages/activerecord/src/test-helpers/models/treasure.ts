// vendor/rails/activerecord/test/models/treasure.rb
import { Base } from "../../base.js";

export class Treasure extends Base {
  static {
    this.hasAndBelongsToMany("parrots");
    this.belongsTo("looter", { polymorphic: true });
    this.belongsTo("ship");
    this.hasMany("priceEstimates", { as: "estimateOf", autosave: true });
    this.hasAndBelongsToMany("richPeople", { joinTable: "peoples_treasures", validate: false });
  }
}

export class HiddenTreasure extends Treasure {}
