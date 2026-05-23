// vendor/rails/activerecord/test/models/hotel.rb
import { Base } from "../../base.js";

export class Hotel extends Base {
  static {
    this.hasMany("departments");
    this.hasMany("chefs", { through: "departments" });
    this.hasMany("cakeDesigners", {
      sourceType: "CakeDesigner",
      source: "employable",
      through: "chefs",
    });
    this.hasMany("drinkDesigners", {
      sourceType: "DrinkDesigner",
      source: "employable",
      through: "chefs",
    });

    this.hasMany("chefLists", { as: "employableList" });
    this.hasMany("mocktailDesigners", {
      through: "chefLists",
      source: "employable",
      sourceType: "MocktailDesigner",
    });

    this.hasMany("recipes", { through: "chefs" });

    this.hasMany("lostItems", { through: "departments" });
  }
}
