import type { Chef } from "./chef.js";
// vendor/rails/activerecord/test/models/recipe.rb
import { Base } from "../../base.js";

export class Recipe extends Base {
  declare chef: Chef | null;
  declare loadBelongsTo: (name: "chef") => Promise<Chef | null>;
  declare chef_id: number;
  declare hotel_id: number;

  static {
    this.belongsTo("chef");
  }
}
