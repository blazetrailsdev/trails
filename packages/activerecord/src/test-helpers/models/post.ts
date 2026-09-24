import { kernelThrow, Module } from "@blazetrails/ruby-compat";
import type { Relation } from "../../relation.js";
import type { Author } from "./author.js";
import type { AuthorAddress } from "./author.js";
import type { AuthorFavorite } from "./author.js";
import type { Categorization } from "./categorization.js";
import type { Category } from "./category.js";
import type { CommentThatAutomaticallyAltersPostBody } from "./comment.js";
import type { CommentWithDefaultScopeReferencesAssociation } from "./comment.js";
import type { Essay } from "./essay.js";
import type { Image } from "./image.js";
import type { IndestructibleTagging } from "./tagging.js";
import type { LazyReader } from "./reader.js";
import type { OrderedTag } from "./tag.js";
import type { Person } from "./person.js";
import type { Rating } from "./rating.js";
import type { Reader } from "./reader.js";
import type { SecureReader } from "./reader.js";
import type { SpecialCategory } from "./category.js";
import type { SpecialComment } from "./comment.js";
import type { Tag } from "./tag.js";
import type { VerySpecialComment } from "./comment.js";
import { ModelName, type ModelLike } from "@blazetrails/activemodel";
import type { AssociationProxy } from "../../associations/collection-proxy.js";
import { Base } from "../../base.js";
import type { ColumnLike } from "../../model-schema.js";
import { ScopeRegistry } from "../../scoping.js";
import { DelegateCache } from "../../relation/delegation.js";
import { registerSubclass } from "../../inheritance.js";
import type { Comment } from "./comment.js";
import type { Tagging } from "./tagging.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CategoryPost extends Base {
  static {
    this._tableName = "categories_posts";
    this.belongsTo("group", { foreignKey: "category_id", className: "Category" });
    this.belongsTo("category");
    this.belongsTo("post");
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CategoryPost {
  get group(): Category | null | Promise<Category | null>;
  set group(value: Category | null);
  get category(): Category | null | Promise<Category | null>;
  set category(value: Category | null);
  get post(): Post | null | Promise<Post | null>;
  set post(value: Post | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Post extends Base {
  declare comments_count: number;
  declare static containingTheLetterA: () => Relation<Post>;
  declare static titledWithAnApostrophe: () => Relation<Post>;
  declare static rankedByComments: () => Relation<Post>;
  declare static orderedByPostId: () => Relation<Post>;
  declare static limitBy: (l: number) => Relation<Post>;
  declare static locked: () => Relation<Post>;
  declare static mostCommented: (commentsCount: number) => Relation<Post>;
  declare static noComments: () => Relation<Post>;
  declare static withSpecialComments: () => Relation<Post>;
  declare static withVerySpecialComments: () => Relation<Post>;
  declare static withPost: (postId: number) => Relation<Post>;
  declare static withComments: () => Relation<Post>;
  declare static withTags: () => Relation<Post>;
  declare static withTagsCte: () => Relation<Post>;
  declare static taggedWith: (id: number) => Relation<Post>;
  declare static taggedWithComment: (comment: string) => Relation<Post>;
  declare static typographicallyInteresting: () => Relation<Post>;
  get firstComment(): Promise<string | null> {
    return Promise.resolve(
      Reflect.get(Object.getPrototypeOf(Post.prototype), "firstComment", this),
    ).then((c: any) => c?.body ?? null);
  }
  declare commentsWithExtend: AssociationProxy<Comment>;
  declare commentsWithExtending: AssociationProxy<Comment>;
  declare commentsWithExtend_2: AssociationProxy<Comment>;
  declare authorFavorites: AssociationProxy<AuthorFavorite>;
  declare authorFavoritesWithScope: AssociationProxy<AuthorFavorite>;
  declare authorCategorizations: AssociationProxy<Categorization>;
  declare authorAddresses: AssociationProxy<AuthorAddress>;
  declare authorAddressExtraWithAddress: AssociationProxy<AuthorAddress>;
  declare commentsWithStringJoins: AssociationProxy<Comment>;
  declare ratingsViaStringJoinComments: AssociationProxy<Rating>;
  declare specialComments: AssociationProxy<SpecialComment>;
  declare nonexistentComments: AssociationProxy<Comment>;
  declare specialCommentsRatings: AssociationProxy<Rating>;
  declare specialCommentsRatingsTaggings: AssociationProxy<Tagging>;
  declare categoryPosts: AssociationProxy<CategoryPost>;
  declare scategories: AssociationProxy<Category>;
  declare hmtSpecialCategories: AssociationProxy<Category>;
  declare categories: AssociationProxy<Category>;
  declare specialCategories: AssociationProxy<SpecialCategory>;
  declare essays: AssociationProxy<Essay>;
  declare authorsOfEssaysNamedBob: AssociationProxy<Author>;
  declare tags: AssociationProxy<Tag>;
  declare indestructibleTaggings: AssociationProxy<IndestructibleTagging>;
  declare indestructibleTags: AssociationProxy<Tag>;
  declare tagsWithDestroy: AssociationProxy<Tag>;
  declare tagsWithNullify: AssociationProxy<Tag>;
  declare miscTags: AssociationProxy<Tag>;
  declare funkyTags: AssociationProxy<Tag>;
  declare superTags: AssociationProxy<Tag>;
  declare orderedTags: AssociationProxy<OrderedTag>;
  declare tagsWithPrimaryKey: AssociationProxy<Tag>;
  declare firstTaggings: AssociationProxy<Tagging>;
  declare firstBlueTags: AssociationProxy<Tag>;
  declare firstBlueTags_2: AssociationProxy<Tag>;
  declare invalidTaggings: AssociationProxy<Tagging>;
  declare invalidTags: AssociationProxy<Tag>;
  declare categorizations: AssociationProxy<Categorization>;
  declare authors: AssociationProxy<Author>;
  declare categorizationsUsingAuthorId: AssociationProxy<Categorization>;
  declare authorsUsingAuthorId: AssociationProxy<Author>;
  declare taggingsUsingAuthorId: AssociationProxy<Tagging>;
  declare tagsUsingAuthorId: AssociationProxy<Tag>;
  declare images: AssociationProxy<Image>;
  declare standardCategorizations: AssociationProxy<Categorization>;
  declare authorUsingCustomPk: AssociationProxy<Author>;
  declare authorsUsingCustomPk: AssociationProxy<Author>;
  declare namedCategories: AssociationProxy<Category>;
  declare readers: AssociationProxy<Reader>;
  declare secureReaders: AssociationProxy<SecureReader>;
  declare readersWithPerson: AssociationProxy<Reader>;
  declare people: AssociationProxy<Person>;
  declare singlePeople: AssociationProxy<Person>;
  declare peopleWithCallbacks: AssociationProxy<Person>;
  declare skimmers: AssociationProxy<Reader>;
  declare impatientPeople: AssociationProxy<Person>;
  declare lazyReaders: AssociationProxy<LazyReader>;
  declare lazyReadersSkimmersOrNot: AssociationProxy<LazyReader>;
  declare lazyPeople: AssociationProxy<Person>;
  declare lazyReadersUnscopeSkimmers: AssociationProxy<LazyReader>;
  declare lazyPeopleUnscopeSkimmers: AssociationProxy<Person>;
  declare author_id: number;
  declare indestructible_tags_count: number | null;
  declare legacy_comments_count: number | null;
  declare taggings_with_delete_all_count: number | null;
  declare taggings_with_destroy_count: number | null;
  declare tags_count: number | null;
  declare tags_with_destroy_count: number | null;
  declare tags_with_nullify_count: number | null;
  declare "type": string;

  declare title: string;
  declare body: string;
  declare comments: AssociationProxy<Comment>;
  declare taggings: AssociationProxy<Tagging>;
  declare taggingsWithDeleteAll: AssociationProxy<Tagging>;
  declare taggingsWithDestroy: AssociationProxy<Tagging>;

  static namedExtension = new Module();

  static CommentsWithExtendAssociationExtension = new Module();

  static namedExtension2 = new Module();

  static {
    this.namedExtension.defineMethod("author", () => "lifo");
    this.namedExtension.defineMethod("greeting", function (this: object) {
      return `${Post.namedExtension.superMethod(this, "greeting")!()} :)`;
    });

    this.namedExtension2.defineMethod("greeting", () => "hullo");
  }

  static _log: Array<[any, any, any]> = [];

  static {
    this.aliasAttribute("text", "body");
    this.aliasAttribute("comments_count", "legacy_comments_count");

    this.scope("containingTheLetterA", function (this: any) {
      return this.where("body LIKE '%a%'");
    });
    this.scope("titledWithAnApostrophe", function (this: any) {
      return this.where("title LIKE '%''%'");
    });
    this.scope("rankedByComments", function (this: any) {
      return this.order(this.model.arelTable.get("comments_count").desc());
    });
    this.scope("orderedByPostId", function (this: any) {
      return this.order("posts.post_id ASC");
    });
    this.scope("limitBy", function (this: any, l: number) {
      return this.limit(l);
    });
    this.scope("locked", function (this: any) {
      return this.lock();
    });
    this.scope("mostCommented", function (this: any, commentsCount: number) {
      return this.joins(":comments")
        .group("posts.id")
        .having("count(comments.id) >= ?", commentsCount);
    });

    this.scope("noComments", function (this: any) {
      return this.leftJoins(":comments").where({ comments: { id: null } });
    });
    this.scope("withSpecialComments", function (this: any) {
      return this.joins(":comments").where({ comments: { type: "SpecialComment" } });
    });
    this.scope("withVerySpecialComments", function (this: any) {
      return this.joins(":comments").where({ comments: { type: "VerySpecialComment" } });
    });
    this.scope("withPost", function (this: any, postId: number) {
      return this.joins(":comments").where({ comments: { post_id: postId } });
    });
    this.scope("withComments", function (this: any) {
      return this.preload(":comments");
    });
    this.scope("withTags", function (this: any) {
      return this.preload(":taggings");
    });
    this.scope("withTagsCte", function (this: any) {
      return this.with({ posts_with_tags: this.model.where("tags_count > 0") }).from(
        "posts_with_tags AS posts",
      );
    });
    this.scope("taggedWith", function (this: any, id: number) {
      return this.joins(":taggings").where({ taggings: { tag_id: id } });
    });
    this.scope("taggedWithComment", function (this: any, comment: string) {
      return this.joins(":taggings").where({ taggings: { comment } });
    });
    this.scope("typographicallyInteresting", function (this: any) {
      return this.where("body LIKE '%a%'").or(this.where("title LIKE '%''%'"));
    });

    this.belongsTo("author");
    this.belongsTo("readonlyAuthor", (q: any) => q.readonly(), {
      className: "Author",
      foreignKey: "author_id",
    });
    this.belongsTo("authorWithPosts", (q: any) => q.includes(":posts"), {
      className: "Author",
      foreignKey: "author_id",
    });
    this.belongsTo("authorWithAddress", (q: any) => q.includes(":authorAddress"), {
      className: "Author",
      foreignKey: "author_id",
    });
    this.belongsTo("authorWithSelect", (q: any) => q.select("id"), {
      className: "Author",
      foreignKey: "author_id",
    });
    this.belongsTo("authorWithTheLetterA", (q: any) => q.where("name LIKE '%a%'"), {
      className: "Author",
      foreignKey: "author_id",
    });

    this.hasOne("firstComment", (q: any) => q.order("id ASC"), { className: "Comment" });
    this.hasOne("lastComment", (q: any) => q.order("id desc"), { className: "Comment" });

    this.hasMany("comments", {
      extend: {
        async findMostRecent(this: any) {
          return this.order("id DESC").first();
        },
        async newest(this: any) {
          return this.created().last();
        },
        theAssociation(this: any) {
          return this.proxyAssociation;
        },
        async withContent(this: any, ...args: unknown[]) {
          const content = args[0] as string;
          const all = await this.toArray();
          return all.find((c: any) => c.body === content) ?? null;
        },
      },
    });
    this.CommentsWithExtendAssociationExtension.defineMethod("greeting", () => "hello");
    this.hasMany("commentsWithExtend", {
      extend: [Post.namedExtension, Post.CommentsWithExtendAssociationExtension],
      className: "Comment",
      foreignKey: "post_id",
    });
    this.hasMany("commentsWithExtending", (q: any) => q.extending(Post.namedExtension), {
      className: "Comment",
      foreignKey: "post_id",
    });
    this.hasMany("commentsWithExtend_2", {
      extend: [Post.namedExtension, Post.namedExtension2],
      className: "Comment",
      foreignKey: "post_id",
    });

    this.hasMany("authorFavorites", { through: "author" });
    this.hasMany("authorFavoritesWithScope", {
      through: "author",
      className: "AuthorFavoriteWithScope",
      source: "authorFavorites",
    });
    this.hasMany("authorCategorizations", { through: "author", source: "categorizations" });
    this.hasMany("authorAddresses", { through: "author" });
    this.hasMany("authorAddressExtraWithAddress", {
      through: "authorWithAddress",
      source: "authorAddressExtra",
    });

    this.hasOne("verySpecialComment");
    this.hasOne("verySpecialCommentWithPost", (q: any) => q.includes(":post"), {
      className: "VerySpecialComment",
    });
    this.hasOne(
      "verySpecialCommentWithPostWithJoins",
      (q: any) => q.joins(":post").order("posts.id"),
      { className: "VerySpecialComment" },
    );
    this.hasOne(
      "verySpecialCommentWithStringJoins",
      (q: any) =>
        q
          .joins("JOIN posts AS p1 ON comments.post_id = p1.id")
          .where()
          .not({ p1: { id: 999999 } }),
      { className: "VerySpecialComment" },
    );
    this.hasMany(
      "commentsWithStringJoins",
      (q: any) =>
        q
          .joins("JOIN posts AS p2 ON comments.post_id = p2.id")
          .where()
          .not({ p2: { id: 999999 } }),
      { className: "Comment", foreignKey: "post_id" },
    );
    this.hasMany("ratingsViaStringJoinComments", {
      through: "commentsWithStringJoins",
      source: "ratings",
    });
    this.hasMany("specialComments");
    this.hasMany("nonexistentComments", (q: any) => q.where("comments.id < 0"), {
      className: "Comment",
    });

    this.hasMany("specialCommentsRatings", { through: "specialComments", source: "ratings" });
    this.hasMany("specialCommentsRatingsTaggings", {
      through: "specialCommentsRatings",
      source: "taggings",
    });

    this.hasMany("categoryPosts", { className: "CategoryPost" });
    this.hasMany("scategories", { through: "categoryPosts", source: "category" });
    this.hasMany("hmtSpecialCategories", (q: any) => q.where().not({ name: null }), {
      through: "categoryPosts",
      source: "category",
      className: "SpecialCategory",
    });
    this.hasAndBelongsToMany("categories");
    this.hasAndBelongsToMany("specialCategories", {
      joinTable: "categories_posts",
      associationForeignKey: "category_id",
    });

    this.hasMany("essays", { through: "categories" });
    this.hasMany("authorsOfEssaysNamedBob", (q: any) => q.where({ name: "Bob" }), {
      through: "essays",
      source: "writer",
      sourceType: "Author",
    });

    this.hasMany("taggings", { as: "taggable", counterCache: "tags_count" });
    this.hasMany("tags", {
      through: "taggings",
      extend: {
        addJoinsAndSelect(this: any) {
          return this.select("tags.*, authors.id as author_id")
            .joins(
              "left outer join posts on taggings.taggable_id = posts.id left outer join authors on posts.author_id = authors.id",
            )
            .toArray();
        },
      },
    });

    this.hasMany("indestructibleTaggings", {
      as: "taggable",
      counterCache: "indestructible_tags_count",
    });
    this.hasMany("indestructibleTags", { through: "indestructibleTaggings", source: "tag" });

    this.hasMany("taggingsWithDeleteAll", {
      className: "Tagging",
      as: "taggable",
      dependent: "delete",
      counterCache: "taggings_with_delete_all_count",
    });
    this.hasMany("taggingsWithDestroy", {
      className: "Tagging",
      as: "taggable",
      dependent: "destroy",
      counterCache: "taggings_with_destroy_count",
    });

    this.hasMany("tagsWithDestroy", {
      through: "taggings",
      source: "tag",
      dependent: "destroy",
      counterCache: "tags_with_destroy_count",
    });
    this.hasMany("tagsWithNullify", {
      through: "taggings",
      source: "tag",
      dependent: "nullify",
      counterCache: "tags_with_nullify_count",
    });

    this.hasMany("miscTags", (q: any) => q.where({ tags: { name: "Misc" } }), {
      through: "taggings",
      source: "tag",
    });
    this.hasMany("funkyTags", { through: "taggings", source: "tag" });
    this.hasMany("superTags", { through: "taggings" });
    this.hasMany("orderedTags", { through: "taggings" });
    this.hasMany("tagsWithPrimaryKey", { through: "taggings", source: "tagWithPrimaryKey" });
    this.hasOne("tagging", { as: "taggable" });

    this.hasMany("firstTaggings", (q: any) => q.where({ taggings: { comment: "first" } }), {
      as: "taggable",
      className: "Tagging",
    });
    this.hasMany("firstBlueTags", (q: any) => q.where({ tags: { name: "Blue" } }), {
      through: "firstTaggings",
      source: "tag",
    });
    this.hasMany("firstBlueTags_2", (q: any) => q.where({ taggings: { comment: "first" } }), {
      through: "taggings",
      source: "blueTag",
    });

    this.hasMany("invalidTaggings", (q: any) => q.where("taggings.id < 0"), {
      as: "taggable",
      className: "Tagging",
    });
    this.hasMany("invalidTags", { through: "invalidTaggings", source: "tag" });

    this.hasMany("categorizations", { foreignKey: "category_id" });
    this.hasMany("authors", { through: "categorizations" });

    this.hasMany("categorizationsUsingAuthorId", {
      primaryKey: "author_id",
      foreignKey: "post_id",
      className: "Categorization",
    });
    this.hasMany("authorsUsingAuthorId", {
      through: "categorizationsUsingAuthorId",
      source: "author",
    });

    this.hasMany("taggingsUsingAuthorId", {
      primaryKey: "author_id",
      as: "taggable",
      className: "Tagging",
    });
    this.hasMany("tagsUsingAuthorId", { through: "taggingsUsingAuthorId", source: "tag" });

    this.hasMany("images", {
      as: "imageable",
      foreignKey: "imageable_identifier",
      foreignType: "imageable_class",
    });
    this.hasOne("mainImage", {
      as: "imageable",
      foreignKey: "imageable_identifier",
      foreignType: "imageable_class",
      className: "Image",
    });

    this.hasMany("standardCategorizations", {
      className: "Categorization",
      foreignKey: "post_id",
    });
    this.hasMany("authorUsingCustomPk", { through: "standardCategorizations" });
    this.hasMany("authorsUsingCustomPk", { through: "standardCategorizations" });
    this.hasMany("namedCategories", { through: "standardCategorizations" });

    this.hasMany("readers");
    this.hasMany("secureReaders");
    this.hasMany("readersWithPerson", (q: any) => q.includes(":person"), { className: "Reader" });
    this.hasMany("people", { through: "readers" });
    this.hasMany("singlePeople", { through: "readers" });
    this.hasMany("peopleWithCallbacks", {
      source: "person",
      through: "readers",
      beforeAdd: (_owner: any, reader: any) => {
        Post.log("added", "before", reader.first_name);
      },
      afterAdd: (_owner: any, reader: any) => {
        Post.log("added", "after", reader.first_name);
      },
      beforeRemove: (_owner: any, reader: any) => {
        Post.log("removed", "before", reader.first_name);
      },
      afterRemove: (_owner: any, reader: any) => {
        Post.log("removed", "after", reader.first_name);
      },
    });
    this.hasMany("skimmers", (q: any) => q.where({ skimmer: true }), { className: "Reader" });
    this.hasMany("impatientPeople", { through: "skimmers", source: "person" });

    this.hasMany("lazyReaders");
    this.hasMany("lazyReadersSkimmersOrNot", (q: any) => q.where({ skimmer: [true, false] }), {
      className: "LazyReader",
    });
    this.hasMany("lazyPeople", { through: "lazyReaders", source: "person" });
    this.hasMany("lazyReadersUnscopeSkimmers", (q: any) => q.skimmersOrNot(), {
      className: "LazyReader",
    });
    this.hasMany("lazyPeopleUnscopeSkimmers", {
      through: "lazyReadersUnscopeSkimmers",
      source: "person",
    });
  }

  static top(limit: number) {
    return (this as any).rankedByComments().limitBy(limit);
  }

  static writtenBy(author: any) {
    return this.where({ id: author.posts.select("id") });
  }

  static resetLog(this: typeof Post) {
    this._log = [];
  }

  static log(
    this: typeof Post,
    message?: any,
    side?: any,
    newRecord?: any,
  ): Array<[any, any, any]> {
    if (message == null) return this._log;
    this._log.push([message, side, newRecord]);
    return this._log;
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Post {
  get verySpecialCommentWithPost(): VerySpecialComment | null | Promise<VerySpecialComment | null>;
  set verySpecialCommentWithPost(value: VerySpecialComment | null);
  get verySpecialCommentWithPostWithJoins():
    | VerySpecialComment
    | null
    | Promise<VerySpecialComment | null>;
  set verySpecialCommentWithPostWithJoins(value: VerySpecialComment | null);
  get verySpecialCommentWithStringJoins():
    | VerySpecialComment
    | null
    | Promise<VerySpecialComment | null>;
  set verySpecialCommentWithStringJoins(value: VerySpecialComment | null);
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Post {
  get author(): Author | null | Promise<Author | null>;
  set author(value: Author | null);
  get readonlyAuthor(): Author | null | Promise<Author | null>;
  set readonlyAuthor(value: Author | null);
  get authorWithPosts(): Author | null | Promise<Author | null>;
  set authorWithPosts(value: Author | null);
  get authorWithAddress(): Author | null | Promise<Author | null>;
  set authorWithAddress(value: Author | null);
  get authorWithSelect(): Author | null | Promise<Author | null>;
  set authorWithSelect(value: Author | null);
  get authorWithTheLetterA(): Author | null | Promise<Author | null>;
  set authorWithTheLetterA(value: Author | null);
  get lastComment(): Comment | null | Promise<Comment | null>;
  set lastComment(value: Comment | null);
  get verySpecialComment(): VerySpecialComment | null | Promise<VerySpecialComment | null>;
  set verySpecialComment(value: VerySpecialComment | null);
  get tagging(): Tagging | null | Promise<Tagging | null>;
  set tagging(value: Tagging | null);
  get mainImage(): Image | null | Promise<Image | null>;
  set mainImage(value: Image | null);
}

export class SpecialPost extends Post {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class StiPost extends Post {
  static {
    this.hasOne("specialComment", { className: "SpecialComment" });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface StiPost {
  get specialComment(): SpecialComment | null | Promise<SpecialComment | null>;
  set specialComment(value: SpecialComment | null);
}

export class AbstractStiPost extends Post {
  static {
    this.abstractClass = true;
  }
}

export class SubStiPost extends StiPost {
  static {
    this._tableName = "posts";
  }
}

export class SubAbstractStiPost extends AbstractStiPost {
  static {
    this._tableName = "posts";
  }
}

export class NullPost extends Post {
  static {
    this.defaultScope((q: any) => q.none());
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class FirstPost extends Base {
  declare comments: AssociationProxy<Comment>;

  static {
    this.inheritanceColumn = "disabled";
    this._tableName = "posts";
    this.defaultScope((q: any) => q.where({ id: 1 }));

    this.hasMany("comments", { foreignKey: "post_id" });
    this.hasOne("comment", { foreignKey: "post_id" });
    this.hasOne("commentWithInverse", {
      className: "Comment",
      inverseOf: "postWithInverse",
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface FirstPost {
  get comment(): Comment | null | Promise<Comment | null>;
  set comment(value: Comment | null);
  get commentWithInverse(): Comment | null | Promise<Comment | null>;
  set commentWithInverse(value: Comment | null);
}

export class PostWithDefaultSelect extends Base {
  static {
    this._tableName = "posts";
    this.defaultScope((q: any) => q.select("author_id"));
  }
}

export class TaggedPost extends Post {
  declare taggings: AssociationProxy<Tagging>;
  declare tags: AssociationProxy<Tag>;

  static {
    this.hasMany("taggings", (q: any) => q.rewhere({ taggable_type: "TaggedPost" }), {
      as: "taggable",
    });
    this.hasMany("tags", { through: "taggings" });
  }
}

export class PostWithDefaultInclude extends Base {
  declare comments: AssociationProxy<Comment>;

  static {
    this.inheritanceColumn = "disabled";
    this._tableName = "posts";
    this.defaultScope((q: any) => q.includes(":comments"));
    this.hasMany("comments", { foreignKey: "post_id" });
  }
}

export class PostWithSpecialCategorization extends Post {
  declare categorizations: AssociationProxy<Categorization>;

  static {
    this.hasMany("categorizations", { foreignKey: "post_id" });
    this.defaultScope((q: any) =>
      q
        .where({ type: "PostWithSpecialCategorization" })
        .joins(":categorizations")
        .where({ categorizations: { special: true } }),
    );
  }
}

export class PostWithDefaultScope extends Base {
  static {
    this.inheritanceColumn = "disabled";
    this._tableName = "posts";
    this.defaultScope((q: any) => q.order("title"));
  }
}

export class PostWithPreloadDefaultScope extends Base {
  declare readers: AssociationProxy<Reader>;

  static {
    this._tableName = "posts";
    this.hasMany("readers", { foreignKey: "post_id" });
    this.defaultScope((q: any) => q.preload(":readers"));
  }
}

export class PostWithIncludesDefaultScope extends Base {
  declare readers: AssociationProxy<Reader>;

  static {
    this._tableName = "posts";
    this.hasMany("readers", { foreignKey: "post_id" });
    this.defaultScope((q: any) => q.includes(":readers"));
  }
}

export class SpecialPostWithDefaultScope extends Base {
  declare static unscopedAll: () => Relation<SpecialPostWithDefaultScope>;
  declare static authorless: () => Relation<SpecialPostWithDefaultScope>;

  static {
    this.inheritanceColumn = "disabled";
    this._tableName = "posts";
    this.defaultScope((q: any) => q.where({ id: [1, 5, 6] }));
    this.scope("unscopedAll", function (this: any) {
      return this.model.unscoped(() => this.model.all());
    });
    this.scope("authorless", function (this: any) {
      return this.model.unscoped(() => this.model.where({ author_id: 0 }));
    });
  }
}

export class PostThatLoadsCommentsInAnAfterSaveHook extends Base {
  declare comments: AssociationProxy<CommentThatAutomaticallyAltersPostBody>;

  static {
    this.inheritanceColumn = "disabled";
    this._tableName = "posts";
    this.hasMany("comments", {
      className: "CommentThatAutomaticallyAltersPostBody",
      foreignKey: "post_id",
    });
    this.afterSave(async function (this: any) {
      await this.comments.load();
    });
  }
}

export class PostWithAfterCreateCallback extends Base {
  declare comments: AssociationProxy<Comment>;
  declare categories: AssociationProxy<Category>;

  static {
    this.inheritanceColumn = "disabled";
    this._tableName = "posts";
    this.hasMany("comments", { foreignKey: "post_id" });
    this.hasAndBelongsToMany("categories", { foreignKey: "post_id" });
    this.afterCreate(async function (this: any) {
      const firstComment = await this.comments.first();
      await this.updateAttribute("author_id", firstComment?.id);
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class PostWithCommentWithDefaultScopeReferencesAssociation extends Base {
  declare commentWithDefaultScopeReferencesAssociations: AssociationProxy<CommentWithDefaultScopeReferencesAssociation>;

  static {
    this.inheritanceColumn = "disabled";
    this._tableName = "posts";
    this.hasMany("commentWithDefaultScopeReferencesAssociations", { foreignKey: "post_id" });
    this.hasOne("firstComment", {
      className: "CommentWithDefaultScopeReferencesAssociation",
      foreignKey: "post_id",
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface PostWithCommentWithDefaultScopeReferencesAssociation {
  get firstComment():
    | CommentWithDefaultScopeReferencesAssociation
    | null
    | Promise<CommentWithDefaultScopeReferencesAssociation | null>;
  set firstComment(value: CommentWithDefaultScopeReferencesAssociation | null);
}

export class SerializedPost extends Base {
  declare author_id: number;
  declare title: string;

  static {
    this.serialize("title");
  }
}

export class ConditionalStiPost extends Post {
  static {
    this.defaultScope((q: any) => q.where({ title: "Untitled" }));
  }
}

export class SubConditionalStiPost extends ConditionalStiPost {}

export class PostWithDestroyCallback extends Base {
  static {
    this.inheritanceColumn = "disabled";
    this._tableName = "posts";
    this.beforeDestroy(function (this: any) {
      if (Number(this.id) === 1) kernelThrow(":abort");
    });
  }
}

export class FakeKlass {
  static relationDelegateClass = DelegateCache.relationDelegateClass;
  static initializeRelationDelegateCache = DelegateCache.initializeRelationDelegateCache;
  static generateRelationMethod = DelegateCache.generateRelationMethod;
  static generatedRelationMethods = DelegateCache.generatedRelationMethods;
  static includeRelationMethods = DelegateCache.includeRelationMethods;

  static scopeRegistry(): ScopeRegistry {
    return ScopeRegistry.instance();
  }

  static adapterClass(): unknown {
    return Post.adapterClass();
  }

  static leaseConnection(): unknown {
    return Post.leaseConnection();
  }

  static get tableName(): string {
    return "posts";
  }

  static get attributeAliases(): Record<string, string> {
    return {};
  }

  static sanitizeSql(sql: unknown): unknown {
    return sql;
  }

  static sanitizeSqlForOrder(sql: unknown): unknown {
    return sql;
  }

  static disallowRawSqlBang(..._args: unknown[]): void {}

  static columnsHash(): Record<string, ColumnLike> {
    return { name: null as unknown as ColumnLike };
  }

  static get arelTable(): unknown {
    return Post.arelTable;
  }

  static get predicateBuilder(): unknown {
    return Post.predicateBuilder;
  }

  static isFinderNeedsTypeCondition(): boolean {
    return false;
  }

  static isBaseClass(): boolean {
    return true;
  }

  static deterministicEncryptedAttributes(): undefined {
    return undefined;
  }

  static {
    FakeKlass.initializeRelationDelegateCache.call(this as unknown as typeof Base);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Postesque extends Base {
  declare author_id: string;
  declare author_name: string;

  static {
    this.belongsTo("author", {
      className: "Author",
      foreignKey: "author_name",
      primaryKey: "name",
    });
    this.belongsTo("authorWithAddress", {
      className: "Author",
      foreignKey: "author_id",
    });
    this.belongsTo("authorWithTheLetterA", {
      className: "Author",
      foreignKey: "author_id",
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Postesque {
  get author(): Author | null | Promise<Author | null>;
  set author(value: Author | null);
  get authorWithAddress(): Author | null | Promise<Author | null>;
  set authorWithAddress(value: Author | null);
  get authorWithTheLetterA(): Author | null | Promise<Author | null>;
  set authorWithTheLetterA(value: Author | null);
}

export class PostRecord extends Base {
  declare comments: AssociationProxy<Comment>;

  static get modelName(): ModelName {
    return new ModelName(this as unknown as ModelLike, null, "Post");
  }

  static {
    this.hasMany("comments");
  }
}

for (const klass of [
  SpecialPost,
  StiPost,
  AbstractStiPost,
  SubStiPost,
  SubAbstractStiPost,
  NullPost,
  TaggedPost,
  PostWithSpecialCategorization,
  ConditionalStiPost,
  SubConditionalStiPost,
]) {
  registerSubclass(klass);
}
