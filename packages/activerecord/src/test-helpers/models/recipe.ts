// vendor/rails/activerecord/test/models/recipe.rb
import { Base } from "../../base.js";

export class Recipe extends Base {
  static {
    this.belongsTo("chef");
  }
}
