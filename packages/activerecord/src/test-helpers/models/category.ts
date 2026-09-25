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
import { registerSubclass } from "../../inheritance.js";

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
      function (this: any) {
        return this.includes(":authors").order("authors.id");
      },
      { className: "Post" },
    );
    this.hasAndBelongsToMany(
      "selectTestingPosts",
      function (this: any) {
        return this.select("posts.*, 1 as correctness_marker");
      },
      { className: "Post", foreignKey: "category_id", associationForeignKey: "post_id" },
    );
    this.hasAndBelongsToMany(
      "postWithConditions",
      function (this: any) {
        return this.where({ title: "Yet Another Testing Title" });
      },
      { className: "Post" },
    );
    this.hasAndBelongsToMany(
      "postsGroupedByTitle",
      function (this: any) {
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
      function (this: any) {
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
      function (this: any) {
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
      function (this: any) {
        return this.where({ essays: { type: "TypedEssay" } });
      },
      { through: "essays", source: "writer", sourceType: "Human", primaryKey: "name" },
    );
    this.scope("general", function (this: any) {
      return this.where({ name: "General" });
    });
  }

  static whatAreYou() {
    return "a category...";
  }
}

export class SpecialCategory extends Category {}

registerSubclass(SpecialCategory);
