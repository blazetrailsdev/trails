import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Relation } from "../../relation.js";
import type { Temporal, Time as RubyTime } from "@blazetrails/date";
import type { Author } from "./author.js";
import type { Company } from "./company.js";
import type { Developer } from "./developer.js";
import type { FirstPost } from "./post.js";
import type { Post } from "./post.js";
import type { PostThatLoadsCommentsInAnAfterSaveHook } from "./post.js";
import type { Rating } from "./rating.js";
import type { SpecialPostWithDefaultScope } from "./post.js";
import { Base } from "../../base.js";
import { registerSubclass } from "../../inheritance.js";

export class OopsError extends Error {}

const OopsExtension = {
  destroyAll(): never {
    throw new OopsError("oops");
  },
};

export class Comment extends Base {
  declare static limitBy: (l: number) => Relation<Comment>;
  declare static containingTheLetterE: () => Relation<Comment>;
  declare static notAgain: () => Relation<Comment>;
  declare static forFirstPost: () => Relation<Comment>;
  declare static forFirstAuthor: () => Relation<Comment>;
  declare static created: () => Relation<Comment>;
  declare static orderedByPostId: () => Relation<Comment>;
  declare static allAsScope: () => Relation<Comment>;
  declare static oopsComments: () => Relation<Comment>;
  declare post: Post | null;
  declare resource: Base | null;
  declare origin: Base | null;
  declare company: Company | null;
  declare ratings: AssociationProxy<Rating>;
  declare firstPost: FirstPost | null;
  declare specialPostWithDefaultScope: SpecialPostWithDefaultScope | null;
  declare children: AssociationProxy<Comment>;
  declare parent: Comment | null;
  declare isDefault: () => boolean;
  declare defaultBang: () => Promise<true | undefined>;
  declare static default: () => Relation<Comment>;
  declare static notDefault: () => Relation<Comment>;
  declare isChild: () => boolean;
  declare childBang: () => Promise<true | undefined>;
  declare static child: () => Relation<Comment>;
  declare static notChild: () => Relation<Comment>;
  declare loadBelongsTo: ((name: "post") => Promise<Post | null>) &
    ((name: "author") => Promise<Base | null>) &
    ((name: "resource") => Promise<Base | null>) &
    ((name: "origin") => Promise<Base | null>) &
    ((name: "company") => Promise<Company | null>) &
    ((name: "firstPost") => Promise<FirstPost | null>) &
    ((name: "specialPostWithDefaultScope") => Promise<SpecialPostWithDefaultScope | null>) &
    ((name: "parent") => Promise<Comment | null>);
  declare body: string;
  declare children_count: number | null;
  declare comments: number;
  declare deleted_at: RubyTime | Temporal.PlainDateTime;
  declare developer_id: number;
  declare label: "default" | "child" | null;
  declare origin_id: number;
  declare origin_type: string;
  declare parent_id: number;
  declare post_id: number;
  declare resource_id: string;
  declare resource_type: string;
  declare tags_count: number | null;
  declare "type": string;
  declare updated_at: RubyTime | Temporal.PlainDateTime;

  declare author_id: number | null;
  declare author_type: string | null;
  declare author: Base | null;

  static {
    this.scope("limitBy", function (this: any, l: number) {
      return this.limit(l);
    });
    this.scope("containingTheLetterE", function (this: any) {
      return this.where("comments.body LIKE '%e%'");
    });
    this.scope("notAgain", function (this: any) {
      return this.where("comments.body NOT LIKE '%again%'");
    });
    this.scope("forFirstPost", function (this: any) {
      return this.where({ post_id: 1 });
    });
    this.scope("forFirstAuthor", function (this: any) {
      return this.joins(":post").where({ "posts.author_id": 1 });
    });
    this.scope("created", function (this: any) {
      return this.all();
    });
    this.scope("orderedByPostId", function (this: any) {
      return this.order("comments.post_id DESC");
    });
    this.scope("allAsScope", function (this: any) {
      return this.all();
    });
    this.scope(
      "oopsComments",
      function (this: any) {
        return this.all();
      },
      OopsExtension,
    );
    this.defaultScope((q: any) => q.extending(OopsExtension));

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
    this.enum("label", ["default", "child"]);
  }

  static allAsMethod() {
    return this.all();
  }

  static whatAreYou() {
    return "a comment...";
  }

  static searchByType(q: string) {
    return this.all().where({ type: q });
  }

  toString() {
    return this.readAttribute("body") as string;
  }
}

export class SpecialComment extends Comment {
  declare ordinaryPost: Post | null;
  declare author: Author | null;
  declare loadBelongsTo: ((name: "post") => Promise<Post | null>) &
    ((name: "author") => Promise<Base | null>) &
    ((name: "resource") => Promise<Base | null>) &
    ((name: "origin") => Promise<Base | null>) &
    ((name: "company") => Promise<Company | null>) &
    ((name: "firstPost") => Promise<FirstPost | null>) &
    ((name: "specialPostWithDefaultScope") => Promise<SpecialPostWithDefaultScope | null>) &
    ((name: "parent") => Promise<Comment | null>) &
    ((name: "ordinaryPost") => Promise<Post | null>);
  declare loadHasOne: (name: "author") => Promise<Author | null>;

  static {
    this.belongsTo("ordinaryPost", { foreignKey: "post_id", className: "Post" });
    this.hasOne("author", { through: "post" });
    this.defaultScope((q: any) => q.where({ deleted_at: null }));
  }

  static whatAreYou() {
    return "a special comment...";
  }
}

export class SubSpecialComment extends SpecialComment {
  declare loadBelongsTo: ((name: "post") => Promise<Post | null>) &
    ((name: "author") => Promise<Base | null>) &
    ((name: "resource") => Promise<Base | null>) &
    ((name: "origin") => Promise<Base | null>) &
    ((name: "company") => Promise<Company | null>) &
    ((name: "firstPost") => Promise<FirstPost | null>) &
    ((name: "specialPostWithDefaultScope") => Promise<SpecialPostWithDefaultScope | null>) &
    ((name: "parent") => Promise<Comment | null>) &
    ((name: "ordinaryPost") => Promise<Post | null>);
  declare loadHasOne: (name: "author") => Promise<Author | null>;
}

export class VerySpecialComment extends Comment {
  declare loadBelongsTo: ((name: "post") => Promise<Post | null>) &
    ((name: "author") => Promise<Base | null>) &
    ((name: "resource") => Promise<Base | null>) &
    ((name: "origin") => Promise<Base | null>) &
    ((name: "company") => Promise<Company | null>) &
    ((name: "firstPost") => Promise<FirstPost | null>) &
    ((name: "specialPostWithDefaultScope") => Promise<SpecialPostWithDefaultScope | null>) &
    ((name: "parent") => Promise<Comment | null>);
}

export class CommentThatAutomaticallyAltersPostBody extends Comment {
  declare loadBelongsTo: ((name: "post") => Promise<Post | null>) &
    ((name: "author") => Promise<Base | null>) &
    ((name: "resource") => Promise<Base | null>) &
    ((name: "origin") => Promise<Base | null>) &
    ((name: "company") => Promise<Company | null>) &
    ((name: "firstPost") => Promise<FirstPost | null>) &
    ((name: "specialPostWithDefaultScope") => Promise<SpecialPostWithDefaultScope | null>) &
    ((name: "parent") => Promise<Comment | null>) &
    ((name: "post") => Promise<PostThatLoadsCommentsInAnAfterSaveHook | null>);

  static {
    this.belongsTo("post", {
      className: "PostThatLoadsCommentsInAnAfterSaveHook",
      foreignKey: "post_id",
    });
    this.afterSave(async function (this: any) {
      const post = await this.post;
      if (post) await post.update({ body: "Automatically altered" });
    });
  }
}

export class CommentWithDefaultScopeReferencesAssociation extends Comment {
  declare developer: Developer | null;
  declare loadBelongsTo: ((name: "post") => Promise<Post | null>) &
    ((name: "author") => Promise<Base | null>) &
    ((name: "resource") => Promise<Base | null>) &
    ((name: "origin") => Promise<Base | null>) &
    ((name: "company") => Promise<Company | null>) &
    ((name: "firstPost") => Promise<FirstPost | null>) &
    ((name: "specialPostWithDefaultScope") => Promise<SpecialPostWithDefaultScope | null>) &
    ((name: "parent") => Promise<Comment | null>) &
    ((name: "developer") => Promise<Developer | null>);

  static {
    this.defaultScope((q: any) =>
      q.includes(":developer").order("developers.name").references(":developer"),
    );
    this.belongsTo("developer");
  }
}

export class CommentWithAfterCreateUpdate extends Comment {
  declare loadBelongsTo: ((name: "post") => Promise<Post | null>) &
    ((name: "author") => Promise<Base | null>) &
    ((name: "resource") => Promise<Base | null>) &
    ((name: "origin") => Promise<Base | null>) &
    ((name: "company") => Promise<Company | null>) &
    ((name: "firstPost") => Promise<FirstPost | null>) &
    ((name: "specialPostWithDefaultScope") => Promise<SpecialPostWithDefaultScope | null>) &
    ((name: "parent") => Promise<Comment | null>);

  static {
    this.afterCreate(async function (this: any) {
      await this.update({ body: "bar" });
    });
  }
}

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
