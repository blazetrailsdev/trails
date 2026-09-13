import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Author } from "./author.js";
import type { Category } from "./category.js";
import type { Post } from "./post.js";
import type { Tagging } from "./tagging.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Categorization extends Base {
  declare postTaggings: AssociationProxy<Tagging>;
  declare authorsUsingCustomPk: AssociationProxy<Author>;
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
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Categorization {
  get post(): Post | null | Promise<Post | null>;
  set post(value: Post | null);
  get category(): Category | null | Promise<Category | null>;
  set category(value: Category | null);
  get namedCategory(): Category | null | Promise<Category | null>;
  set namedCategory(value: Category | null);
  get author(): Author | null | Promise<Author | null>;
  set author(value: Author | null);
  get authorUsingCustomPk(): Author | null | Promise<Author | null>;
  set authorUsingCustomPk(value: Author | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SpecialCategorization extends Base {
  static {
    this._tableName = "categorizations";
    this.defaultScope((q: any) => q.where({ special: true }));
    this.belongsTo("author");
    this.belongsTo("category");
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SpecialCategorization {
  get author(): Author | null | Promise<Author | null>;
  set author(value: Author | null);
  get category(): Category | null | Promise<Category | null>;
  set category(value: Category | null);
}
