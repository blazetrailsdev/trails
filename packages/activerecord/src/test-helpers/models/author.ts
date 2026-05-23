// vendor/rails/activerecord/test/models/author.rb
import { Base } from "../../base.js";

export class Author extends Base {
  static namedExtension = {
    author() {
      return "lifo";
    },
    greeting(this: any) {
      return "hello :)";
    },
  };

  postLog: string[] = [];

  static {
    this.hasMany("posts");
    this.hasMany("serializedPosts");
    this.hasOne("post");
    this.hasMany("verySpecialComments", { through: "posts" });
    this.hasMany("postsWithComments", {
      scope: (q: any) => q.includes("comments"),
      className: "Post",
    });
    this.hasMany("popularGroupedPosts", {
      scope: (q: any) =>
        q
          .includes("comments")
          .group("type")
          .having("SUM(legacy_comments_count) > 1")
          .select("type"),
      className: "Post",
    });
    this.hasMany("postsWithCommentsSortedByCommentId", {
      scope: (q: any) => q.includes("comments").order("comments.id"),
      className: "Post",
    });
    this.hasMany("postsSortedById", {
      scope: (q: any) => q.order("id"),
      className: "Post",
    });
    this.hasMany("postsSortedByIdLimited", {
      scope: (q: any) => q.order("posts.id").limit(1),
      className: "Post",
    });
    this.hasMany("postsWithCategories", {
      scope: (q: any) => q.includes("categories"),
      className: "Post",
    });
    this.hasMany("postsWithCommentsAndCategories", {
      scope: (q: any) => q.includes("comments", "categories").order("posts.id"),
      className: "Post",
    });
    this.hasMany("postsWithSpecialCategorizations", { className: "PostWithSpecialCategorization" });
    this.hasOne("postAboutThinking", {
      scope: (q: any) => q.where("posts.title like '%thinking%'"),
      className: "Post",
    });
    this.hasOne("postAboutThinkingWithLastComment", {
      scope: (q: any) => q.where("posts.title like '%thinking%'").includes("lastComment"),
      className: "Post",
    });

    this.hasMany("comments", { through: "posts" });
    this.hasMany("commentsWithOrder", {
      scope: (q: any) => q.orderedByPostId(),
      through: "posts",
      source: "comments",
    });
    this.hasMany("noJoinsComments", {
      through: "posts",
      disableJoins: true,
      source: "comments",
    });

    this.hasMany("commentsWithForeignKey", {
      through: "posts",
      source: "comments",
      foreignKey: "post_id",
    });
    this.hasMany("noJoinsCommentsWithForeignKey", {
      through: "posts",
      disableJoins: true,
      source: "comments",
      foreignKey: "post_id",
    });

    this.hasMany("members", {
      through: "commentsWithOrder",
      source: "origin",
      sourceType: "Member",
    });
    this.hasMany("noJoinsMembers", {
      through: "commentsWithOrder",
      source: "origin",
      sourceType: "Member",
      disableJoins: true,
    });
    this.hasMany("orderedMembers", {
      scope: (q: any) => q.order({ id: "desc" }),
      through: "commentsWithOrder",
      source: "origin",
      sourceType: "Member",
    });
    this.hasMany("noJoinsOrderedMembers", {
      scope: (q: any) => q.order({ id: "desc" }),
      through: "commentsWithOrder",
      source: "origin",
      sourceType: "Member",
      disableJoins: true,
    });

    this.hasMany("ratings", { through: "comments" });
    this.hasMany("goodRatings", {
      scope: (q: any) => q.where("ratings.value > 5").order("id"),
      through: "comments",
      source: "ratings",
    });
    this.hasMany("noJoinsRatings", {
      through: "noJoinsComments",
      disableJoins: true,
      source: "ratings",
    });
    this.hasMany("noJoinsGoodRatings", {
      scope: (q: any) => q.where("ratings.value > 5").order("id"),
      through: "comments",
      source: "ratings",
      disableJoins: true,
    });

    this.hasMany("commentsContainingTheLetterE", { through: "posts", source: "comments" });
    this.hasMany("commentsWithOrderAndConditions", {
      scope: (q: any) => q.order("comments.body").where("comments.body like 'Thank%'"),
      through: "posts",
      source: "comments",
    });
    this.hasMany("commentsWithInclude", {
      scope: (q: any) => q.includes("post").where({ posts: { type: "Post" } }),
      through: "posts",
      source: "comments",
    });
    this.hasMany("commentsForFirstAuthor", {
      scope: (q: any) => q.forFirstAuthor(),
      through: "posts",
      source: "comments",
    });

    this.hasMany("firstPosts");
    this.hasMany("commentsOnFirstPosts", {
      scope: (q: any) => q.order("posts.id desc, comments.id asc"),
      through: "firstPosts",
      source: "comments",
    });
    this.hasOne("firstPost");
    this.hasOne("commentOnFirstPost", {
      scope: (q: any) => q.order("posts.id desc, comments.id asc"),
      through: "firstPost",
      source: "comments",
    });

    this.hasMany("thinkingPosts", {
      scope: (q: any) => q.where({ title: "So I was thinking" }),
      // Rails: dependent: :delete_all — not yet supported, using "delete" as closest equivalent
      dependent: "delete",
      className: "Post",
    });
    this.hasMany("welcomePosts", {
      scope: (q: any) => q.where({ title: "Welcome to the weblog" }),
      className: "Post",
    });
    this.hasMany("welcomePostsWithOneComment", {
      scope: (q: any) => q.where({ title: "Welcome to the weblog" }).where({ comments_count: 1 }),
      className: "Post",
    });
    this.hasMany("welcomePostsWithComments", {
      scope: (q: any) =>
        q.where({ title: "Welcome to the weblog" }).where("legacy_comments_count > 0"),
      className: "Post",
    });

    this.hasMany("commentsDesc", {
      scope: (q: any) => q.order("comments.id DESC"),
      through: "postsSortedById",
      source: "comments",
    });
    this.hasMany("unorderedComments", {
      scope: (q: any) => q.unscope("order").distinct(),
      through: "postsSortedByIdLimited",
      source: "comments",
    });
    this.hasMany("funkyComments", { through: "posts", source: "comments" });
    this.hasMany("orderedUniqComments", {
      scope: (q: any) => q.distinct().order("comments.id"),
      through: "posts",
      source: "comments",
    });
    this.hasMany("orderedUniqCommentsDesc", {
      scope: (q: any) => q.distinct().order("comments.id DESC"),
      through: "posts",
      source: "comments",
    });
    this.hasMany("readonlyComments", {
      scope: (q: any) => q.readonly(),
      through: "posts",
      source: "comments",
    });

    this.hasMany("specialPosts");
    this.hasMany("specialPostComments", { through: "specialPosts", source: "comments" });
    this.hasMany("specialPostsWithDefaultScope", { className: "SpecialPostWithDefaultScope" });

    this.hasMany("stiPosts", { className: "StiPost" });
    this.hasMany("stiPostComments", { through: "stiPosts", source: "comments" });

    this.hasMany("specialNonexistentPosts", {
      scope: (q: any) => q.where("posts.body = 'nonexistent'"),
      className: "SpecialPost",
    });
    this.hasMany("specialNonexistentPostComments", {
      scope: (q: any) => q.where({ "comments.post_id": 0 }),
      through: "specialNonexistentPosts",
      source: "comments",
    });
    this.hasMany("nonexistentComments", { through: "posts" });

    this.hasMany("helloPosts", {
      scope: (q: any) => q.where("posts.body = 'hello'"),
      className: "Post",
    });
    this.hasMany("helloPostComments", { through: "helloPosts", source: "comments" });
    this.hasMany("postsWithNoComments", {
      scope: (q: any) => q.where({ "comments.id": null }).includes("comments"),
      className: "Post",
    });
    this.hasMany("postsWithNoComments_2", {
      scope: (q: any) => q.leftJoins("comments").where({ "comments.id": null }),
      className: "Post",
    });

    this.hasMany("helloPostsWithHashConditions", {
      scope: (q: any) => q.where({ body: "hello" }),
      className: "Post",
    });
    this.hasMany("helloPostCommentsWithHashConditions", {
      through: "helloPostsWithHashConditions",
      source: "comments",
    });

    this.hasMany("otherPosts", { className: "Post" });
    this.hasMany("postsWithCallbacks", {
      className: "Post",
      beforeAdd: (owner: any, r: any) => owner.postLog.push(`before_adding${r.id ?? "<new>"}`),
      afterAdd: (owner: any, r: any) => owner.postLog.push(`after_adding${r.id}`),
      beforeRemove: (owner: any, r: any) => owner.postLog.push(`before_removing${r.id}`),
      afterRemove: (owner: any, r: any) => owner.postLog.push(`after_removing${r.id}`),
    });
    this.hasMany("postsWithThrownCallbacks", {
      className: "Post",
      beforeAdd: (_owner: any, _r: any) => {
        throw "abort";
      },
      afterAdd: (_owner: any, _r: any) => {
        throw new Error("ensure_not_called");
      },
      beforeRemove: (_owner: any, _r: any) => {
        throw "abort";
      },
      afterRemove: (_owner: any, _r: any) => {
        throw new Error("ensure_not_called");
      },
    });
    this.hasMany("postsWithProcCallbacks", {
      className: "Post",
      beforeAdd: (o: any, r: any) => o.postLog.push(`before_adding${r.id ?? "<new>"}`),
      afterAdd: (o: any, r: any) => o.postLog.push(`after_adding${r.id ?? "<new>"}`),
      beforeRemove: (o: any, r: any) => o.postLog.push(`before_removing${r.id}`),
      afterRemove: (o: any, r: any) => o.postLog.push(`after_removing${r.id}`),
    });
    this.hasMany("postsWithMultipleCallbacks", {
      className: "Post",
      beforeAdd: [
        (owner: any, r: any) => owner.postLog.push(`before_adding${r.id ?? "<new>"}`),
        (o: any, r: any) => o.postLog.push(`before_adding_proc${r.id ?? "<new>"}`),
      ],
      afterAdd: [
        (owner: any, r: any) => owner.postLog.push(`after_adding${r.id}`),
        (o: any, r: any) => o.postLog.push(`after_adding_proc${r.id ?? "<new>"}`),
      ],
    });
    this.hasMany("unchangeablePosts", {
      className: "Post",
      beforeAdd: (_owner: any, _object: any) => {
        throw new Error("You can't add a post");
      },
      afterAdd: (owner: any, r: any) => owner.postLog.push(`after_adding${r.id}`),
    });

    this.hasMany("categorizations");
    this.hasMany("categories", { through: "categorizations" });
    this.hasMany("namedCategories", { through: "categorizations" });

    this.hasMany("specialCategorizations");
    this.hasMany("specialCategories", { through: "specialCategorizations", source: "category" });
    this.hasOne("specialCategory", { through: "specialCategorizations", source: "category" });

    this.hasMany("generalCategorizations", {
      scope: (q: any) => q.joins("category").where({ "categories.name": "General" }),
      className: "Categorization",
    });
    this.hasMany("generalPosts", { through: "generalCategorizations", source: "post" });

    this.hasMany("specialCategoriesWithConditions", {
      scope: (q: any) => q.where({ categorizations: { special: true } }),
      through: "categorizations",
      source: "category",
    });
    this.hasMany("nonspecialCategoriesWithConditions", {
      scope: (q: any) => q.where({ categorizations: { special: false } }),
      through: "categorizations",
      source: "category",
    });

    this.hasMany("categoriesLikeGeneral", {
      scope: (q: any) => q.where({ name: "General" }),
      through: "categorizations",
      source: "category",
      className: "Category",
    });

    this.hasMany("categorizedPosts", { through: "categorizations", source: "post" });
    this.hasMany("uniqueCategorizedPosts", {
      scope: (q: any) => q.distinct(),
      through: "categorizations",
      source: "post",
    });

    this.hasMany("nothings", { through: "kateggorizatons", className: "Category" });

    this.hasMany("authorFavorites");
    this.hasMany("favoriteAuthors", {
      scope: (q: any) => q.order("name"),
      through: "authorFavorites",
    });

    this.hasMany("taggings", { through: "posts", source: "taggings" });
    this.hasMany("taggings_2", { through: "posts", source: "tagging" });
    this.hasMany("tags", { through: "posts" });
    this.hasMany("orderedTags", { through: "posts" });
    this.hasMany("postCategories", { through: "posts", source: "categories" });
    this.hasMany("taggingTags", { through: "taggings", source: "tag" });

    this.hasMany("similarPosts", {
      scope: (q: any) => q.distinct(),
      through: "tags",
      source: "taggedPosts",
    });
    this.hasMany("orderedPosts", {
      scope: (q: any) => q.distinct(),
      through: "orderedTags",
      source: "taggedPosts",
    });
    this.hasMany("distinctTags", {
      scope: (q: any) => q.select("DISTINCT tags.*").order("tags.name"),
      through: "posts",
      source: "tags",
    });

    this.hasMany("tagsWithPrimaryKey", { through: "posts" });

    this.hasMany("books");
    this.hasMany("bestHardbacks", {
      through: "books",
      source: "formatRecord",
      sourceType: "BestHardback",
    });
    this.hasMany("publishedBooks", { className: "PublishedBook" });
    this.hasMany("unpublishedBooks", {
      scope: (q: any) => q.where({ status: ["proposed", "written"] }),
      className: "Book",
    });
    this.hasOne("unreadListing", {
      scope: (q: any) => q.unread(),
      className: "Book",
      foreignKey: "last_read",
    });
    this.hasOne("readingListing", {
      scope: (q: any) => q.reading(),
      className: "Book",
      foreignKey: "last_read",
    });
    this.hasMany("subscriptions", { through: "books" });
    this.hasMany("subscribers", {
      scope: (q: any) => q.order("subscribers.nick"),
      through: "subscriptions",
    });
    this.hasMany("distinctSubscribers", {
      scope: (q: any) => q.select("DISTINCT subscribers.*").order("subscribers.nick"),
      through: "subscriptions",
      source: "subscriber",
    });

    this.hasOne("essay", { primaryKey: "name", as: "writer" });
    this.hasOne("essayCategory", { through: "essay", source: "category" });
    this.hasOne("essayOwner", { through: "essay", source: "owner" });

    this.hasOne("essay_2", { primaryKey: "name", className: "Essay", foreignKey: "author_id" });
    this.hasOne("essayCategory_2", { through: "essay_2", source: "category" });

    this.hasMany("essays", { primaryKey: "name", as: "writer" });
    this.hasMany("essayCategories", { through: "essays", source: "category" });
    this.hasMany("essayOwners", { through: "essays", source: "owner" });

    this.hasMany("essays_2", { primaryKey: "name", className: "Essay", foreignKey: "author_id" });
    this.hasMany("essayCategories_2", { through: "essays_2", source: "category" });

    this.belongsTo("ownedEssay", { primaryKey: "name", className: "Essay" });
    this.hasOne("ownedEssayCategory", { through: "ownedEssay", source: "category" });

    this.belongsTo("authorAddress", { dependent: "destroy" });
    this.belongsTo("authorAddressExtra", { dependent: "delete", className: "AuthorAddress" });

    this.hasMany("categoryPostComments", { through: "categories", source: "postComments" });

    this.hasMany("miscPosts", {
      scope: (q: any) => q.where({ posts: { title: ["misc post by bob", "misc post by mary"] } }),
      className: "Post",
    });
    this.hasMany("miscPostFirstBlueTags", { through: "miscPosts", source: "firstBlueTags" });

    this.hasMany("miscPostFirstBlueTags_2", {
      scope: (q: any) => q.where({ posts: { title: ["misc post by bob", "misc post by mary"] } }),
      through: "posts",
      source: "firstBlueTags_2",
    });

    this.hasMany("postsWithDefaultInclude", { className: "PostWithDefaultInclude" });
    this.hasMany("commentsOnPostsWithDefaultInclude", {
      through: "postsWithDefaultInclude",
      source: "comments",
    });

    this.hasMany("postsWithSignature", {
      scope: (q: any, record: any) =>
        q.where(q._modelClass.arelTable.get("title").matches(`%by ${record.name.toLowerCase()}%`)),
      className: "Post",
    });
    this.hasMany("postsMentioningAuthor", {
      scope: (q: any, record: any) =>
        q.where(
          q._modelClass.arelTable.get("body").matches(`%${record?.name?.toLowerCase() ?? ""}%`),
        ),
      className: "Post",
    });
    this.hasMany("commentsOnPostsMentioningAuthor", {
      through: "postsMentioningAuthor",
      source: "comments",
    });
    this.hasMany("commentsMentioningAuthor", {
      scope: (q: any, record: any) =>
        q.where(q._modelClass.arelTable.get("body").matches(`%${record.name.toLowerCase()}%`)),
      through: "posts",
      source: "comments",
    });

    this.hasOne("recentPost", { scope: (q: any) => q.order({ id: "desc" }), className: "Post" });
    this.hasOne("recentResponse", { through: "recentPost", source: "comments" });

    this.hasMany("postsWithExtension", { scope: (q: any) => q.order("title"), className: "Post" });
    this.hasMany("postsWithExtensionAndInstance", {
      scope: (q: any, _record: any) => q.order("title"),
      className: "Post",
    });

    this.hasMany("topPosts", { scope: (q: any) => q.order({ id: "asc" }), className: "Post" });
    this.hasMany("otherTopPosts", { scope: (q: any) => q.order({ id: "asc" }), className: "Post" });

    this.hasMany("topics", { primaryKey: "name", foreignKey: "author_name" });
    this.hasMany("topicsWithoutType", {
      scope: (q: any) => q.select("id", "title", "author_name"),
      className: "Topic",
      primaryKey: "name",
      foreignKey: "author_name",
    });

    this.hasMany("lazyReadersSkimmersOrNot", { through: "posts" });
    this.hasMany("lazyReadersSkimmersOrNot_2", {
      through: "postsWithNoComments",
      source: "lazyReadersSkimmersOrNot",
    });
    this.hasMany("lazyReadersSkimmersOrNot_3", {
      through: "postsWithNoComments_2",
      source: "lazyReadersSkimmersOrNot",
    });

    this.validates("name", { presence: true });

    this.afterInitialize(function (this: Author) {
      this.postLog = [];
    });
  }

  label() {
    return `${this.id}-${(this as any).name}`;
  }

  social() {
    return ["twitter", "github"];
  }
}

export class AuthorAddress extends Base {
  static destroyedAuthorAddressIds: number[] = [];

  static {
    this.hasOne("author");
    this.beforeDestroy(function (this: AuthorAddress) {
      AuthorAddress.destroyedAuthorAddressIds.push(this.id as number);
    });
  }
}

export class AuthorFavorite extends Base {
  static {
    this.belongsTo("author");
    this.belongsTo("favoriteAuthor", { className: "Author" });
  }
}

export class AuthorFavoriteWithScope extends Base {
  static {
    this._tableName = "author_favorites";
    this.defaultScope((q: any) => q.order({ id: "asc" }));
    this.belongsTo("author");
    this.belongsTo("favoriteAuthor", { className: "Author" });
  }
}
