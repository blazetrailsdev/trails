// vendor/rails/activerecord/test/models/post.rb
import { Base } from "../../base.js";

export class CategoryPost extends Base {
  static {
    this._tableName = "categories_posts";
    this.belongsTo("group", { foreignKey: "category_id", className: "Category" });
    this.belongsTo("category");
    this.belongsTo("post");
  }
}

export class Post extends Base {
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
    this.scope("typographicallyInteresting", (q: any) =>
      q._modelClass.containingTheLetterA().or(q._modelClass.titledWithAnApostrophe()),
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

    this.hasMany("comments");
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

export class SpecialPost extends Post {}

export class StiPost extends Post {
  static {
    this.hasOne("specialComment", { className: "SpecialComment" });
  }
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

export class SubAbstractStiPost extends AbstractStiPost {}

export class NullPost extends Post {
  static {
    this.defaultScope((q: any) => q.none());
  }
}

export class FirstPost extends Base {
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
  static {
    this.hasMany("taggings", {
      scope: (q: any) => q.rewhere({ taggable_type: "TaggedPost" }),
      as: "taggable",
    });
    this.hasMany("tags", { through: "taggings" });
  }
}

export class PostWithDefaultInclude extends Base {
  static {
    this.inheritanceColumn = "disabled";
    this._tableName = "posts";
    this.defaultScope((q: any) => q.includes("comments"));
    this.hasMany("comments", { foreignKey: "post_id" });
  }
}

export class PostWithSpecialCategorization extends Post {
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
  static {
    this._tableName = "posts";
    this.hasMany("readers", { foreignKey: "post_id" });
    this.defaultScope((q: any) => q.preload("readers"));
  }
}

export class PostWithIncludesDefaultScope extends Base {
  static {
    this._tableName = "posts";
    this.hasMany("readers", { foreignKey: "post_id" });
    this.defaultScope((q: any) => q.includes("readers"));
  }
}

export class SpecialPostWithDefaultScope extends Base {
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
    this.beforeDestroy(async function (this: any) {
      if (this.id === 1) throw "abort";
    });
  }
}

export class Postesque extends Base {
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
  static {
    this.hasMany("comments");
  }
}
