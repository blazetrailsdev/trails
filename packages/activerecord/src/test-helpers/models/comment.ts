// vendor/rails/activerecord/test/models/comment.rb
import { Base } from "../../base.js";
import { registerSubclass } from "../../inheritance.js";

// Rails: `class OopsError < RuntimeError; end` — raised by the OopsExtension
// `destroy_all` override that the `oops_comments` scope extends onto its
// relation.
export class OopsError extends Error {}

// Rails: `module OopsExtension; def destroy_all; raise OopsError; end; end`.
const OopsExtension = {
  destroyAll(): never {
    throw new OopsError("oops");
  },
};

export class Comment extends Base {
  declare author_id: number | null;
  declare author_type: string | null;
  declare author: Base | null;

  static {
    this.scope("limitBy", (q: any, l: number) => q.limit(l));
    this.scope("containingTheLetterE", (q: any) => q.where("comments.body LIKE '%e%'"));
    this.scope("notAgain", (q: any) => q.where("comments.body NOT LIKE '%again%'"));
    this.scope("forFirstPost", (q: any) => q.where({ post_id: 1 }));
    this.scope("forFirstAuthor", (q: any) => q.joins("post").where({ "posts.author_id": 1 }));
    this.scope("created", (q: any) => q.all());
    this.scope("orderedByPostId", (q: any) => q.order("comments.post_id DESC"));
    this.scope("allAsScope", (q: any) => q.all());
    // Rails: `scope :oops_comments, -> { extending OopsExtension }`.
    this.scope("oopsComments", (q: any) => q.all(), OopsExtension);

    this.belongsTo("post", { counterCache: true });
    this.belongsTo("author", { polymorphic: true });
    this.belongsTo("resource", { polymorphic: true });
    this.belongsTo("origin", { polymorphic: true });
    this.belongsTo("company", { foreignKey: "company" });
    this.hasMany("ratings");
    this.belongsTo("firstPost", { foreignKey: "post_id" });
    this.belongsTo("specialPostWithDefaultScope", { foreignKey: "post_id" });
    this.hasMany("children", { className: "Comment", inverseOf: "parent" });
    this.belongsTo("parent", {
      className: "Comment",
      counterCache: "children_count",
      inverseOf: "children",
    });
    this.enum("label", { default: 0, child: 1 });
  }

  static allAsMethod() {
    return this.all();
  }

  static whatAreYou() {
    return "a comment...";
  }

  // Rails: `all.where("#{QUOTED_TYPE} = ?", q)`. QUOTED_TYPE is the inheritance
  // column (`type`), so the hash form emits the identical `type = ?` predicate.
  static searchByType(q: string) {
    return this.all().where({ type: q });
  }

  toString() {
    return this.readAttribute("body") as string;
  }
}

export class SpecialComment extends Comment {
  static {
    this.belongsTo("ordinaryPost", { foreignKey: "post_id", className: "Post" });
    this.hasOne("author", { through: "post" });
    this.defaultScope((q: any) => q.where({ deleted_at: null }));
  }

  static whatAreYou() {
    return "a special comment...";
  }
}

export class SubSpecialComment extends SpecialComment {}

export class VerySpecialComment extends Comment {}

export class CommentThatAutomaticallyAltersPostBody extends Comment {
  static {
    this.belongsTo("post", {
      className: "PostThatLoadsCommentsInAnAfterSaveHook",
      foreignKey: "post_id",
    });
    this.afterSave(async function (this: any) {
      // Rails: `comment.post.update(...)`. trails belongsTo readers are async,
      // so await the target before updating it.
      const post = await this.post;
      if (post) await post.update({ body: "Automatically altered" });
    });
  }
}

export class CommentWithDefaultScopeReferencesAssociation extends Comment {
  static {
    this.defaultScope((q: any) =>
      q.includes("developer").order("developers.name").references("developer"),
    );
    this.belongsTo("developer");
  }
}

export class CommentWithAfterCreateUpdate extends Comment {
  static {
    this.afterCreate(async function (this: any) {
      await this.update({ body: "bar" });
    });
  }
}

// Track the STI subtree on the `comments` table so registry-safe row-path
// resolution finds these through Comment's own subtree.
for (const klass of [
  SpecialComment,
  SubSpecialComment,
  VerySpecialComment,
  CommentThatAutomaticallyAltersPostBody,
  CommentWithDefaultScopeReferencesAssociation,
  CommentWithAfterCreateUpdate,
]) {
  registerSubclass(klass);
}
