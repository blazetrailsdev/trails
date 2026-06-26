import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { CakeDesigner } from "./cake-designer.js";
import type { Chef } from "./chef.js";
import type { ChefList } from "./chef.js";
import type { Department } from "./department.js";
import type { DrinkDesigner } from "./drink-designer.js";
import type { MocktailDesigner } from "./drink-designer.js";
import type { Recipe } from "./recipe.js";
// vendor/rails/activerecord/test/models/hotel.rb
import { Base } from "../../base.js";

export class Hotel extends Base {
  declare departments: AssociationProxy<Department>;
  declare chefs: AssociationProxy<Chef>;
  declare cakeDesigners: AssociationProxy<CakeDesigner>;
  declare drinkDesigners: AssociationProxy<DrinkDesigner>;
  declare chefLists: AssociationProxy<ChefList>;
  declare mocktailDesigners: AssociationProxy<MocktailDesigner>;
  declare recipes: AssociationProxy<Recipe>;
  declare lostItems: AssociationProxy<Base>;

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
