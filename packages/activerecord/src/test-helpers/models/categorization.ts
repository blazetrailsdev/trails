// vendor/rails/activerecord/test/models/categorization.rb
import { Base } from "../../base.js";

export class Categorization extends Base {
  static {
    this.belongsTo("post");
    this.belongsTo("category", { counterCache: true });
    this.belongsTo("namedCategory", {
      className: "Category",
      foreignKey: "named_category_name",
      primaryKey: "name",
    });
    this.belongsTo("author");
    this.hasMany("postTaggings", { through: "author", source: "taggings" });
    this.belongsTo("authorUsingCustomPk", {
      className: "Author",
      foreignKey: "author_id",
      primaryKey: "author_address_extra_id",
    });
    this.hasMany("authorsUsingCustomPk", {
      className: "Author",
      foreignKey: "id",
      primaryKey: "category_id",
    });
  }
}

export class SpecialCategorization extends Base {
  static {
    this._tableName = "categorizations";
    this.defaultScope((q: any) => q.where({ special: true }));
    this.belongsTo("author");
    this.belongsTo("category");
  }
}
