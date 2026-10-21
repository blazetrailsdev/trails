import type { Club } from "./club.js";
import type { ScopeOn } from "../../scoping/named.js";
import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Relation } from "../../relation.js";
import type { Author } from "./author.js";
import type { Categorization } from "./categorization.js";
import type { Comment } from "./comment.js";
import type { Essay } from "./essay.js";
import type { Human } from "./human.js";
import type { Post } from "./post.js";
import type { SpecialCategorization } from "./categorization.js";
import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

declare module "../../relation.js" {
  interface RelationScopes<T extends Base> {
    general: ScopeOn<T, Club | Category>;
  }
}

export class Category extends Base {
  declare posts: AssociationProxy<Post>;
  declare specialPosts: AssociationProxy<Post>;
  declare otherPosts: AssociationProxy<Post>;
  declare postsWithAuthorsSortedByAuthorId: AssociationProxy<Post>;
  declare selectTestingPosts: AssociationProxy<Post>;
  declare postWithConditions: AssociationProxy<Post>;
  declare postsGroupedByTitle: AssociationProxy<Post>;
  declare categorizations: AssociationProxy<Categorization>;
  declare specialCategorizations: AssociationProxy<SpecialCategorization>;
  declare postComments: AssociationProxy<Comment>;
  declare orderedPostComments: AssociationProxy<Comment>;
  declare authors: AssociationProxy<Author>;
  declare authorsWithSelect: AssociationProxy<Author>;
  declare essays: AssociationProxy<Essay>;
  declare humanWritersOfTypedEssays: AssociationProxy<Human>;
  declare static general: () => Relation<Category>;
  declare categorizations_count: number;
  declare name: string;
  declare "type": string;

  static {
    this.hasAndBelongsToMany("posts");
    this.hasAndBelongsToMany("specialPosts", { className: "Post" });
    this.hasAndBelongsToMany("otherPosts", { className: "Post" });
    this.hasAndBelongsToMany(
      "postsWithAuthorsSortedByAuthorId",
      function () {
        return this.includes(":authors").order("authors.id");
      },
      { className: "Post" },
    );
    this.hasAndBelongsToMany(
      "selectTestingPosts",
      function () {
        return this.select("posts.*, 1 as correctness_marker");
      },
      { className: "Post", foreignKey: "category_id", associationForeignKey: "post_id" },
    );
    this.hasAndBelongsToMany(
      "postWithConditions",
      function () {
        return this.where({ title: "Yet Another Testing Title" });
      },
      { className: "Post" },
    );
    this.hasAndBelongsToMany(
      "postsGroupedByTitle",
      function () {
        return this.group("title").select("title");
      },
      {
        className: "Post",
      },
    );
    this.hasMany("categorizations");
    this.hasMany("specialCategorizations");
    this.hasMany("postComments", { through: "posts", source: "comments" });
    this.hasMany(
      "orderedPostComments",
      function () {
        return this.order({ id: "desc" });
      },
      {
        through: "posts",
        source: "comments",
      },
    );
    this.hasMany("authors", { through: "categorizations" });
    this.hasMany(
      "authorsWithSelect",
      function () {
        return this.select("authors.*, categorizations.post_id");
      },
      {
        through: "categorizations",
        source: "author",
      },
    );
    this.hasMany("essays", { primaryKey: "name" });
    this.hasMany(
      "humanWritersOfTypedEssays",
      function () {
        return this.where({ essays: { type: "TypedEssay" } });
      },
      { through: "essays", source: "writer", sourceType: "Human", primaryKey: "name" },
    );
    this.scope("general", function () {
      return this.where({ name: "General" });
    });
  }

  static whatAreYou() {
    return "a category...";
  }
}
registerModel(Category);

export class SpecialCategory extends Category {}

registerModel(SpecialCategory);
