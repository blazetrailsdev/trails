import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Author } from "./author.js";
import type { Category } from "./category.js";
import type { Post } from "./post.js";
import type { Tagging } from "./tagging.js";
// vendor/rails/activerecord/test/models/categorization.rb
import { Base } from "../../base.js";

export class Categorization extends Base {
  declare post: Post | null;
  declare category: Category | null;
  declare namedCategory: Category | null;
  declare author: Author | null;
  declare postTaggings: AssociationProxy<Tagging>;
  declare authorUsingCustomPk: Author | null;
  declare authorsUsingCustomPk: AssociationProxy<Author>;
  declare loadBelongsTo: ((name: "post") => Promise<Post | null>) &
    ((name: "category") => Promise<Category | null>) &
    ((name: "namedCategory") => Promise<Category | null>) &
    ((name: "author") => Promise<Author | null>) &
    ((name: "authorUsingCustomPk") => Promise<Author | null>);
  declare author_id: number;
  declare category_id: number;
  declare named_category_name: string;
  declare post_id: number;
  declare special: boolean;

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
  declare author: Author | null;
  declare category: Category | null;
  declare loadBelongsTo: ((name: "author") => Promise<Author | null>) &
    ((name: "category") => Promise<Category | null>);

  static {
    this._tableName = "categorizations";
    this.defaultScope((q: any) => q.where({ special: true }));
    this.belongsTo("author");
    this.belongsTo("category");
  }
}
