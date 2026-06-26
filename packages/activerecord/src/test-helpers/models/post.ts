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
import { throwAbort } from "@blazetrails/activesupport";
// vendor/rails/activerecord/test/models/post.rb
import type { AssociationProxy } from "../../associations/collection-proxy.js";
import { Base } from "../../base.js";
import { registerSubclass } from "../../inheritance.js";
import type { Comment } from "./comment.js";
import type { Tagging } from "./tagging.js";

export class CategoryPost extends Base {
  declare group: Category | null;
  declare category: Category | null;
  declare post: Post | null;
  declare loadBelongsTo: ((name: "group") => Promise<Category | null>) &
    ((name: "category") => Promise<Category | null>) &
    ((name: "post") => Promise<Post | null>);

  static {
    this._tableName = "categories_posts";
    this.belongsTo("group", { foreignKey: "category_id", className: "Category" });
    this.belongsTo("category");
    this.belongsTo("post");
  }
}

export class Post extends Base {
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
  declare author: Author | null;
  declare readonlyAuthor: Author | null;
  declare authorWithPosts: Author | null;
  declare authorWithAddress: Author | null;
  declare authorWithSelect: Author | null;
  declare authorWithTheLetterA: Author | null;
  declare firstComment: Comment | null;
  declare lastComment: Comment | null;
  declare commentsWithExtend: AssociationProxy<Comment>;
  declare commentsWithExtending: AssociationProxy<Comment>;
  declare commentsWithExtend_2: AssociationProxy<Comment>;
  declare authorFavorites: AssociationProxy<AuthorFavorite>;
  declare authorFavoritesWithScope: AssociationProxy<AuthorFavorite>;
  declare authorCategorizations: AssociationProxy<Categorization>;
  declare authorAddresses: AssociationProxy<AuthorAddress>;
  declare authorAddressExtraWithAddress: AssociationProxy<AuthorAddress>;
  declare verySpecialComment: VerySpecialComment | null;
  declare verySpecialCommentWithPost: VerySpecialComment | null;
  declare verySpecialCommentWithPostWithJoins: VerySpecialComment | null;
  declare verySpecialCommentWithStringJoins: VerySpecialComment | null;
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
  declare tagging: Tagging | null;
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
  declare mainImage: Image | null;
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
  declare loadBelongsTo: ((name: "author") => Promise<Author | null>) &
    ((name: "readonlyAuthor") => Promise<Author | null>) &
    ((name: "authorWithPosts") => Promise<Author | null>) &
    ((name: "authorWithAddress") => Promise<Author | null>) &
    ((name: "authorWithSelect") => Promise<Author | null>) &
    ((name: "authorWithTheLetterA") => Promise<Author | null>);
  declare loadHasOne: ((name: "firstComment") => Promise<Comment | null>) &
    ((name: "lastComment") => Promise<Comment | null>) &
    ((name: "verySpecialComment") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithPost") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithPostWithJoins") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithStringJoins") => Promise<VerySpecialComment | null>) &
    ((name: "tagging") => Promise<Tagging | null>) &
    ((name: "mainImage") => Promise<Image | null>);
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

  static namedExtension = {
    author() {
      return "lifo";
    },
    greeting(this: any) {
      return "hello :)";
    },
  };

  static namedExtension2 = {
    greeting() {
      return "hullo";
    },
  };

  static _log: Array<[any, any, any]> = [];

  static {
    this.aliasAttribute("text", "body");
    this.aliasAttribute("commentsCount", "legacy_comments_count");

    this.scope("containingTheLetterA", (q: any) => q.where("body LIKE '%a%'"));
    this.scope("titledWithAnApostrophe", (q: any) => q.where("title LIKE '%''%'"));
    this.scope("rankedByComments", (q: any) =>
      q.order(q._modelClass.arelTable.get("commentsCount").desc()),
    );
    this.scope("orderedByPostId", (q: any) => q.order("posts.post_id ASC"));
    this.scope("limitBy", (q: any, l: number) => q.limit(l));
    this.scope("locked", (q: any) => q.lock());
    this.scope("mostCommented", (q: any, commentsCount: number) =>
      q.joins("comments").group("posts.id").having("count(comments.id) >= ?", commentsCount),
    );

    this.scope("noComments", (q: any) => q.leftJoins("comments").where({ comments: { id: null } }));
    this.scope("withSpecialComments", (q: any) =>
      q.joins("comments").where({ comments: { type: "SpecialComment" } }),
    );
    this.scope("withVerySpecialComments", (q: any) =>
      q.joins("comments").where({ comments: { type: "VerySpecialComment" } }),
    );
    this.scope("withPost", (q: any, postId: number) =>
      q.joins("comments").where({ comments: { post_id: postId } }),
    );
    this.scope("withComments", (q: any) => q.preload("comments"));
    this.scope("withTags", (q: any) => q.preload("taggings"));
    this.scope("withTagsCte", (q: any) =>
      q
        .with({ posts_with_tags: q._modelClass.where("tags_count > 0") })
        .from("posts_with_tags AS posts"),
    );
    this.scope("taggedWith", (q: any, id: number) =>
      q.joins("taggings").where({ taggings: { tag_id: id } }),
    );
    this.scope("taggedWithComment", (q: any, comment: string) =>
      q.joins("taggings").where({ taggings: { comment } }),
    );
    // Rails: `-> { containing_the_letter_a.or(titled_with_an_apostrophe) }` —
    // each bare scope call resolves against the lambda's `self` (the current
    // relation), so both `or` branches inherit `q`'s accumulated scope. trails
    // passes the *unwrapped* relation as `q` to scope bodies (the scope proxy
    // calls `scopeFn(target, ...)` with the proxy's raw target — verified:
    // `typeof q.containingTheLetterA === "undefined"` inside a scope body), so
    // the two named scopes can't be re-invoked on `q` directly. Inline their
    // predicates on `q` — exactly what `q.containingTheLetterA()` would expand
    // to (`q.where(A)`) — which keeps the per-branch scoping `q.where(A).or(
    // q.where(B))` without evaluating the scopes from `Post.all()` (avoids
    // re-applying any future default scope).
    this.scope("typographicallyInteresting", (q: any) =>
      q.where("body LIKE '%a%'").or(q.where("title LIKE '%''%'")),
    );

    this.belongsTo("author");
    this.belongsTo("readonlyAuthor", {
      scope: (q: any) => q.readonly(),
      className: "Author",
      foreignKey: "author_id",
    });
    this.belongsTo("authorWithPosts", {
      scope: (q: any) => q.includes("posts"),
      className: "Author",
      foreignKey: "author_id",
    });
    this.belongsTo("authorWithAddress", {
      scope: (q: any) => q.includes("authorAddress"),
      className: "Author",
      foreignKey: "author_id",
    });
    this.belongsTo("authorWithSelect", {
      scope: (q: any) => q.select("id"),
      className: "Author",
      foreignKey: "author_id",
    });
    this.belongsTo("authorWithTheLetterA", {
      scope: (q: any) => q.where("name LIKE '%a%'"),
      className: "Author",
      foreignKey: "author_id",
    });

    this.hasOne("firstComment", {
      scope: (q: any) => q.order("id ASC"),
      className: "Comment",
    });
    this.hasOne("lastComment", {
      scope: (q: any) => q.order("id desc"),
      className: "Comment",
    });

    this.hasMany("comments", {
      // Rails: `has_many :comments do ... end` — the inline extension block on
      // Post#comments. Mixed onto the CollectionProxy and any relation spawned
      // off it (e.g. `.offset(1)`), per AssociationsExtensionsTest.
      extend: {
        async findMostRecent(this: any) {
          return this.order("id DESC").first();
        },
        // Rails post.rb:81-83 — `def newest; created.last; end`. `created` is
        // the `Comment.created` named scope (`-> { all }`); calling it bare on
        // the extension's `self` resolves through scope delegation.
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
    this.hasMany("commentsWithExtend", {
      extend: Post.namedExtension,
      className: "Comment",
      foreignKey: "post_id",
    });
    this.hasMany("commentsWithExtending", {
      scope: (q: any) => q.extending(Post.namedExtension),
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
    this.hasOne("verySpecialCommentWithPost", {
      scope: (q: any) => q.includes("post"),
      className: "VerySpecialComment",
    });
    this.hasOne("verySpecialCommentWithPostWithJoins", {
      scope: (q: any) => q.joins("post").order("posts.id"),
      className: "VerySpecialComment",
    });
    this.hasOne("verySpecialCommentWithStringJoins", {
      scope: (q: any) =>
        q.joins("JOIN posts AS p1 ON comments.post_id = p1.id").whereNot({ p1: { id: 999999 } }),
      className: "VerySpecialComment",
    });
    // trails-authored: a through chain whose intermediate (`through`) reflection
    // scope contributes a raw-string `joins(...)`. Exercises the through-path
    // analogue of `verySpecialCommentWithStringJoins` — the string-join source
    // must attach to the intermediate chain step, not be dropped.
    this.hasMany("commentsWithStringJoins", {
      scope: (q: any) =>
        q.joins("JOIN posts AS p2 ON comments.post_id = p2.id").whereNot({ p2: { id: 999999 } }),
      className: "Comment",
      foreignKey: "post_id",
    });
    this.hasMany("ratingsViaStringJoinComments", {
      through: "commentsWithStringJoins",
      source: "ratings",
    });
    this.hasMany("specialComments");
    this.hasMany("nonexistentComments", {
      scope: (q: any) => q.where("comments.id < 0"),
      className: "Comment",
    });

    this.hasMany("specialCommentsRatings", { through: "specialComments", source: "ratings" });
    this.hasMany("specialCommentsRatingsTaggings", {
      through: "specialCommentsRatings",
      source: "taggings",
    });

    this.hasMany("categoryPosts", { className: "CategoryPost" });
    this.hasMany("scategories", { through: "categoryPosts", source: "category" });
    this.hasMany("hmtSpecialCategories", {
      scope: (q: any) => q.whereNot({ name: null }),
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
    this.hasMany("authorsOfEssaysNamedBob", {
      scope: (q: any) => q.where({ name: "Bob" }),
      through: "essays",
      source: "writer",
      sourceType: "Author",
    });

    this.hasMany("taggings", { as: "taggable", counterCache: "tags_count" });
    this.hasMany("tags", { through: "taggings" });

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

    this.hasMany("miscTags", {
      scope: (q: any) => q.where({ tags: { name: "Misc" } }),
      through: "taggings",
      source: "tag",
    });
    this.hasMany("funkyTags", { through: "taggings", source: "tag" });
    this.hasMany("superTags", { through: "taggings" });
    this.hasMany("orderedTags", { through: "taggings" });
    this.hasMany("tagsWithPrimaryKey", { through: "taggings", source: "tagWithPrimaryKey" });
    this.hasOne("tagging", { as: "taggable" });

    this.hasMany("firstTaggings", {
      scope: (q: any) => q.where({ taggings: { comment: "first" } }),
      as: "taggable",
      className: "Tagging",
    });
    this.hasMany("firstBlueTags", {
      scope: (q: any) => q.where({ tags: { name: "Blue" } }),
      through: "firstTaggings",
      source: "tag",
    });
    this.hasMany("firstBlueTags_2", {
      scope: (q: any) => q.where({ taggings: { comment: "first" } }),
      through: "taggings",
      source: "blueTag",
    });

    this.hasMany("invalidTaggings", {
      scope: (q: any) => q.where("taggings.id < 0"),
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
    this.hasMany("readersWithPerson", {
      scope: (q: any) => q.includes("person"),
      className: "Reader",
    });
    this.hasMany("people", { through: "readers" });
    this.hasMany("singlePeople", { through: "readers" });
    this.hasMany("peopleWithCallbacks", {
      source: "person",
      through: "readers",
      beforeAdd: (_owner: any, reader: any) => {
        Post.log("added", "before", reader.firstName);
      },
      afterAdd: (_owner: any, reader: any) => {
        Post.log("added", "after", reader.firstName);
      },
      beforeRemove: (_owner: any, reader: any) => {
        Post.log("removed", "before", reader.firstName);
      },
      afterRemove: (_owner: any, reader: any) => {
        Post.log("removed", "after", reader.firstName);
      },
    });
    this.hasMany("skimmers", {
      scope: (q: any) => q.where({ skimmer: true }),
      className: "Reader",
    });
    this.hasMany("impatientPeople", { through: "skimmers", source: "person" });

    this.hasMany("lazyReaders");
    this.hasMany("lazyReadersSkimmersOrNot", {
      scope: (q: any) => q.where({ skimmer: [true, false] }),
      className: "LazyReader",
    });
    this.hasMany("lazyPeople", { through: "lazyReaders", source: "person" });
    this.hasMany("lazyReadersUnscopeSkimmers", {
      scope: (q: any) => q.skimmersOrNot(),
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

export class SpecialPost extends Post {
  declare loadBelongsTo: ((name: "author") => Promise<Author | null>) &
    ((name: "readonlyAuthor") => Promise<Author | null>) &
    ((name: "authorWithPosts") => Promise<Author | null>) &
    ((name: "authorWithAddress") => Promise<Author | null>) &
    ((name: "authorWithSelect") => Promise<Author | null>) &
    ((name: "authorWithTheLetterA") => Promise<Author | null>);
  declare loadHasOne: ((name: "firstComment") => Promise<Comment | null>) &
    ((name: "lastComment") => Promise<Comment | null>) &
    ((name: "verySpecialComment") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithPost") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithPostWithJoins") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithStringJoins") => Promise<VerySpecialComment | null>) &
    ((name: "tagging") => Promise<Tagging | null>) &
    ((name: "mainImage") => Promise<Image | null>);
}

export class StiPost extends Post {
  declare specialComment: SpecialComment | null;
  declare loadBelongsTo: ((name: "author") => Promise<Author | null>) &
    ((name: "readonlyAuthor") => Promise<Author | null>) &
    ((name: "authorWithPosts") => Promise<Author | null>) &
    ((name: "authorWithAddress") => Promise<Author | null>) &
    ((name: "authorWithSelect") => Promise<Author | null>) &
    ((name: "authorWithTheLetterA") => Promise<Author | null>);
  declare loadHasOne: ((name: "firstComment") => Promise<Comment | null>) &
    ((name: "lastComment") => Promise<Comment | null>) &
    ((name: "verySpecialComment") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithPost") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithPostWithJoins") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithStringJoins") => Promise<VerySpecialComment | null>) &
    ((name: "tagging") => Promise<Tagging | null>) &
    ((name: "mainImage") => Promise<Image | null>) &
    ((name: "specialComment") => Promise<SpecialComment | null>);

  static {
    this.hasOne("specialComment", { className: "SpecialComment" });
  }
}

export class AbstractStiPost extends Post {
  declare loadBelongsTo: ((name: "author") => Promise<Author | null>) &
    ((name: "readonlyAuthor") => Promise<Author | null>) &
    ((name: "authorWithPosts") => Promise<Author | null>) &
    ((name: "authorWithAddress") => Promise<Author | null>) &
    ((name: "authorWithSelect") => Promise<Author | null>) &
    ((name: "authorWithTheLetterA") => Promise<Author | null>);
  declare loadHasOne: ((name: "firstComment") => Promise<Comment | null>) &
    ((name: "lastComment") => Promise<Comment | null>) &
    ((name: "verySpecialComment") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithPost") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithPostWithJoins") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithStringJoins") => Promise<VerySpecialComment | null>) &
    ((name: "tagging") => Promise<Tagging | null>) &
    ((name: "mainImage") => Promise<Image | null>);

  static {
    this.abstractClass = true;
  }
}

export class SubStiPost extends StiPost {
  declare loadBelongsTo: ((name: "author") => Promise<Author | null>) &
    ((name: "readonlyAuthor") => Promise<Author | null>) &
    ((name: "authorWithPosts") => Promise<Author | null>) &
    ((name: "authorWithAddress") => Promise<Author | null>) &
    ((name: "authorWithSelect") => Promise<Author | null>) &
    ((name: "authorWithTheLetterA") => Promise<Author | null>);
  declare loadHasOne: ((name: "firstComment") => Promise<Comment | null>) &
    ((name: "lastComment") => Promise<Comment | null>) &
    ((name: "verySpecialComment") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithPost") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithPostWithJoins") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithStringJoins") => Promise<VerySpecialComment | null>) &
    ((name: "tagging") => Promise<Tagging | null>) &
    ((name: "mainImage") => Promise<Image | null>) &
    ((name: "specialComment") => Promise<SpecialComment | null>);

  static {
    this._tableName = "posts";
  }
}

export class SubAbstractStiPost extends AbstractStiPost {
  declare loadBelongsTo: ((name: "author") => Promise<Author | null>) &
    ((name: "readonlyAuthor") => Promise<Author | null>) &
    ((name: "authorWithPosts") => Promise<Author | null>) &
    ((name: "authorWithAddress") => Promise<Author | null>) &
    ((name: "authorWithSelect") => Promise<Author | null>) &
    ((name: "authorWithTheLetterA") => Promise<Author | null>);
  declare loadHasOne: ((name: "firstComment") => Promise<Comment | null>) &
    ((name: "lastComment") => Promise<Comment | null>) &
    ((name: "verySpecialComment") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithPost") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithPostWithJoins") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithStringJoins") => Promise<VerySpecialComment | null>) &
    ((name: "tagging") => Promise<Tagging | null>) &
    ((name: "mainImage") => Promise<Image | null>);

  static {
    // Rails inherits `posts` through the abstract parent; trails derives a
    // table from the (own) base class name, so pin it explicitly.
    this._tableName = "posts";
  }
}

export class NullPost extends Post {
  declare loadBelongsTo: ((name: "author") => Promise<Author | null>) &
    ((name: "readonlyAuthor") => Promise<Author | null>) &
    ((name: "authorWithPosts") => Promise<Author | null>) &
    ((name: "authorWithAddress") => Promise<Author | null>) &
    ((name: "authorWithSelect") => Promise<Author | null>) &
    ((name: "authorWithTheLetterA") => Promise<Author | null>);
  declare loadHasOne: ((name: "firstComment") => Promise<Comment | null>) &
    ((name: "lastComment") => Promise<Comment | null>) &
    ((name: "verySpecialComment") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithPost") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithPostWithJoins") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithStringJoins") => Promise<VerySpecialComment | null>) &
    ((name: "tagging") => Promise<Tagging | null>) &
    ((name: "mainImage") => Promise<Image | null>);

  static {
    this.defaultScope((q: any) => q.none());
  }
}

export class FirstPost extends Base {
  declare comments: AssociationProxy<Comment>;
  declare comment: Comment | null;
  declare commentWithInverse: Comment | null;
  declare loadHasOne: ((name: "comment") => Promise<Comment | null>) &
    ((name: "commentWithInverse") => Promise<Comment | null>);

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

export class PostWithDefaultSelect extends Base {
  static {
    this._tableName = "posts";
    this.defaultScope((q: any) => q.select("author_id"));
  }
}

export class TaggedPost extends Post {
  declare taggings: AssociationProxy<Tagging>;
  declare tags: AssociationProxy<Tag>;
  declare loadBelongsTo: ((name: "author") => Promise<Author | null>) &
    ((name: "readonlyAuthor") => Promise<Author | null>) &
    ((name: "authorWithPosts") => Promise<Author | null>) &
    ((name: "authorWithAddress") => Promise<Author | null>) &
    ((name: "authorWithSelect") => Promise<Author | null>) &
    ((name: "authorWithTheLetterA") => Promise<Author | null>);
  declare loadHasOne: ((name: "firstComment") => Promise<Comment | null>) &
    ((name: "lastComment") => Promise<Comment | null>) &
    ((name: "verySpecialComment") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithPost") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithPostWithJoins") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithStringJoins") => Promise<VerySpecialComment | null>) &
    ((name: "tagging") => Promise<Tagging | null>) &
    ((name: "mainImage") => Promise<Image | null>);

  static {
    this.hasMany("taggings", {
      scope: (q: any) => q.rewhere({ taggable_type: "TaggedPost" }),
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
    this.defaultScope((q: any) => q.includes("comments"));
    this.hasMany("comments", { foreignKey: "post_id" });
  }
}

export class PostWithSpecialCategorization extends Post {
  declare categorizations: AssociationProxy<Categorization>;
  declare loadBelongsTo: ((name: "author") => Promise<Author | null>) &
    ((name: "readonlyAuthor") => Promise<Author | null>) &
    ((name: "authorWithPosts") => Promise<Author | null>) &
    ((name: "authorWithAddress") => Promise<Author | null>) &
    ((name: "authorWithSelect") => Promise<Author | null>) &
    ((name: "authorWithTheLetterA") => Promise<Author | null>);
  declare loadHasOne: ((name: "firstComment") => Promise<Comment | null>) &
    ((name: "lastComment") => Promise<Comment | null>) &
    ((name: "verySpecialComment") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithPost") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithPostWithJoins") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithStringJoins") => Promise<VerySpecialComment | null>) &
    ((name: "tagging") => Promise<Tagging | null>) &
    ((name: "mainImage") => Promise<Image | null>);

  static {
    this.hasMany("categorizations", { foreignKey: "post_id" });
    this.defaultScope((q: any) =>
      q
        .where({ type: "PostWithSpecialCategorization" })
        .joins("categorizations")
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
    this.defaultScope((q: any) => q.preload("readers"));
  }
}

export class PostWithIncludesDefaultScope extends Base {
  declare readers: AssociationProxy<Reader>;

  static {
    this._tableName = "posts";
    this.hasMany("readers", { foreignKey: "post_id" });
    this.defaultScope((q: any) => q.includes("readers"));
  }
}

export class SpecialPostWithDefaultScope extends Base {
  declare static unscopedAll: () => Relation<SpecialPostWithDefaultScope>;
  declare static authorless: () => Relation<SpecialPostWithDefaultScope>;

  static {
    this.inheritanceColumn = "disabled";
    this._tableName = "posts";
    this.defaultScope((q: any) => q.where({ id: [1, 5, 6] }));
    this.scope("unscopedAll", (q: any) => q._modelClass.unscoped(() => q._modelClass.all()));
    this.scope("authorless", (q: any) =>
      q._modelClass.unscoped(() => q._modelClass.where({ author_id: 0 })),
    );
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

export class PostWithCommentWithDefaultScopeReferencesAssociation extends Base {
  declare commentWithDefaultScopeReferencesAssociations: AssociationProxy<CommentWithDefaultScopeReferencesAssociation>;
  declare firstComment: CommentWithDefaultScopeReferencesAssociation | null;
  declare loadHasOne: (
    name: "firstComment",
  ) => Promise<CommentWithDefaultScopeReferencesAssociation | null>;

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

export class SerializedPost extends Base {
  declare author_id: number;
  declare title: string;

  static {
    this.serialize("title");
  }
}

export class ConditionalStiPost extends Post {
  declare loadBelongsTo: ((name: "author") => Promise<Author | null>) &
    ((name: "readonlyAuthor") => Promise<Author | null>) &
    ((name: "authorWithPosts") => Promise<Author | null>) &
    ((name: "authorWithAddress") => Promise<Author | null>) &
    ((name: "authorWithSelect") => Promise<Author | null>) &
    ((name: "authorWithTheLetterA") => Promise<Author | null>);
  declare loadHasOne: ((name: "firstComment") => Promise<Comment | null>) &
    ((name: "lastComment") => Promise<Comment | null>) &
    ((name: "verySpecialComment") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithPost") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithPostWithJoins") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithStringJoins") => Promise<VerySpecialComment | null>) &
    ((name: "tagging") => Promise<Tagging | null>) &
    ((name: "mainImage") => Promise<Image | null>);

  static {
    this.defaultScope((q: any) => q.where({ title: "Untitled" }));
  }
}

export class SubConditionalStiPost extends ConditionalStiPost {
  declare loadBelongsTo: ((name: "author") => Promise<Author | null>) &
    ((name: "readonlyAuthor") => Promise<Author | null>) &
    ((name: "authorWithPosts") => Promise<Author | null>) &
    ((name: "authorWithAddress") => Promise<Author | null>) &
    ((name: "authorWithSelect") => Promise<Author | null>) &
    ((name: "authorWithTheLetterA") => Promise<Author | null>);
  declare loadHasOne: ((name: "firstComment") => Promise<Comment | null>) &
    ((name: "lastComment") => Promise<Comment | null>) &
    ((name: "verySpecialComment") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithPost") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithPostWithJoins") => Promise<VerySpecialComment | null>) &
    ((name: "verySpecialCommentWithStringJoins") => Promise<VerySpecialComment | null>) &
    ((name: "tagging") => Promise<Tagging | null>) &
    ((name: "mainImage") => Promise<Image | null>);
}

export class PostWithDestroyCallback extends Base {
  static {
    this.inheritanceColumn = "disabled";
    this._tableName = "posts";
    this.beforeDestroy(async function (this: any) {
      if (this.id === 1) throwAbort();
    });
  }
}

export class Postesque extends Base {
  declare author: Author | null;
  declare authorWithAddress: Author | null;
  declare authorWithTheLetterA: Author | null;
  declare loadBelongsTo: ((name: "author") => Promise<Author | null>) &
    ((name: "authorWithAddress") => Promise<Author | null>) &
    ((name: "authorWithTheLetterA") => Promise<Author | null>);
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

export class PostRecord extends Base {
  declare comments: AssociationProxy<Comment>;

  static {
    this.hasMany("comments");
  }
}

// Track the STI subtree on the `posts` table so registry-safe row-path
// resolution (Base.instantiate → discriminateClassForRecord) finds these
// classes through Post's own subtree rather than the global model registry.
// Rails: `posts` carries a `type` column, so Post's non-abstract descendants
// auto-layer a `type IN (...)` finder condition (`finder_needs_type_condition?`,
// column-presence detected) with no explicit enableSti opt-in.
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
