// vendor/rails/activerecord/test/models/category.rb
import { Base } from "../../base.js";

export class Category extends Base {
  static {
    this.hasAndBelongsToMany("posts");
    this.hasAndBelongsToMany("specialPosts", { className: "Post" });
    this.hasAndBelongsToMany("otherPosts", { className: "Post" });
    this.hasAndBelongsToMany("postsWithAuthorsSortedByAuthorId", {
      scope: (q: any) => q.includes("authors").order("authors.id"),
      className: "Post",
    });
    this.hasAndBelongsToMany("selectTestingPosts", {
      scope: (q: any) => q.select("posts.*, 1 as correctness_marker"),
      className: "Post",
      foreignKey: "category_id",
      associationForeignKey: "post_id",
    });
    this.hasAndBelongsToMany("postWithConditions", {
      scope: (q: any) => q.where({ title: "Yet Another Testing Title" }),
      className: "Post",
    });
    this.hasAndBelongsToMany("postsGroupedByTitle", {
      scope: (q: any) => q.group("title").select("title"),
      className: "Post",
    });
    this.hasMany("categorizations");
    this.hasMany("specialCategorizations");
    this.hasMany("postComments", { through: "posts", source: "comments" });
    this.hasMany("orderedPostComments", {
      scope: (q: any) => q.order({ id: "desc" }),
      through: "posts",
      source: "comments",
    });
    this.hasMany("authors", { through: "categorizations" });
    this.hasMany("authorsWithSelect", {
      scope: (q: any) => q.select("authors.*, categorizations.post_id"),
      through: "categorizations",
      source: "author",
    });
    this.hasMany("essays", { primaryKey: "name" });
    this.hasMany("humanWritersOfTypedEssays", {
      scope: (q: any) => q.where({ essays: { type: "TypedEssay" } }),
      through: "essays",
      source: "writer",
      sourceType: "Human",
      primaryKey: "name",
    });
    this.scope("general", (q: any) => q.where({ name: "General" }));
  }

  static whatAreYou() {
    return "a category...";
  }
}

export class SpecialCategory extends Category {}
