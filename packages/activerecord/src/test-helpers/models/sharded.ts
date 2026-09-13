import type { AssociationProxy } from "../../associations/collection-proxy.js";
import { Base } from "../../base.js";
import { queryConstraints } from "../../persistence.js";

export class ShardedBlog extends Base {
  declare blogPosts: AssociationProxy<ShardedBlogPost>;
  declare commentsViaPosts: AssociationProxy<ShardedComment>;
  declare name: string;

  static _tableName = "sharded_blogs";

  static {
    this.hasMany("blogPosts", { className: "ShardedBlogPost", foreignKey: "blog_id" });
    this.hasMany("commentsViaPosts", {
      through: "blogPosts",
      source: "commentsWithCompositePk",
      className: "ShardedComment",
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ShardedBlogPost extends Base {
  declare comments: AssociationProxy<ShardedComment>;
  declare deleteComments: AssociationProxy<ShardedComment>;
  declare children: AssociationProxy<ShardedBlogPost>;
  declare blogPostTags: AssociationProxy<ShardedBlogPostTag>;
  declare tags: AssociationProxy<ShardedTag>;
  declare commentsWithCompositePk: AssociationProxy<ShardedComment>;
  declare commentsWithInverse: AssociationProxy<ShardedComment>;
  declare blog_id: number;
  declare parent_id: number;
  declare parent_type: string;
  declare revision: number;
  declare title: string;

  static _tableName = "sharded_blog_posts";

  static {
    queryConstraints.call(this, "blog_id", "id");

    this.belongsTo("parent", { polymorphic: true });
    this.belongsTo("blog", { className: "ShardedBlog" });
    this.hasMany("comments", {
      className: "ShardedComment",
      foreignKey: ["blog_id", "blog_post_id"],
    });
    this.hasMany("deleteComments", {
      className: "ShardedComment",
      foreignKey: ["blog_id", "blog_post_id"],
      dependent: "delete",
    });
    this.hasMany("children", { className: "ShardedBlogPost", as: "parent" });

    this.hasMany("blogPostTags", {
      className: "ShardedBlogPostTag",
      foreignKey: ["blog_id", "blog_post_id"],
    });
    this.hasMany("tags", { through: "blogPostTags", className: "ShardedTag" });

    this.hasMany("commentsWithCompositePk", {
      className: "ShardedComment",
      primaryKey: ["blog_id", "id"],
      foreignKey: ["blog_id", "blog_post_id"],
    });

    this.hasMany("commentsWithInverse", {
      className: "ShardedComment",
      foreignKey: ["blog_id", "blog_post_id"],
      inverseOf: "blogPostWithInverse",
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ShardedBlogPost {
  get parent(): Base | null | Promise<Base | null>;
  set parent(value: Base | null);
  get blog(): ShardedBlog | null | Promise<ShardedBlog | null>;
  set blog(value: ShardedBlog | null);
}

export class ShardedBlogPostWithRevision extends Base {
  declare comments: AssociationProxy<ShardedComment>;

  static _tableName = "sharded_blog_posts";

  static {
    queryConstraints.call(this, "blog_id", "revision", "id");

    this.hasMany("comments", {
      className: "ShardedComment",
      primaryKey: ["blog_id", "id"],
      foreignKey: ["blog_id", "blog_post_id"],
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ShardedComment extends Base {
  declare blog_id: number;
  declare blog_post_id: number;
  declare body: string;

  static _tableName = "sharded_comments";

  static {
    queryConstraints.call(this, "blog_id", "id");

    this.belongsTo("blogPost", { className: "ShardedBlogPost" });
    this.belongsTo("blogPostById", {
      className: "ShardedBlogPost",
      foreignKey: "blog_post_id",
      primaryKey: "id",
    });
    this.belongsTo("blogPostWithInverse", {
      className: "ShardedBlogPost",
      foreignKey: ["blog_id", "blog_post_id"],
      primaryKey: ["blog_id", "id"],
      inverseOf: "commentsWithInverse",
    });
    this.belongsTo("blog", { className: "ShardedBlog" });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ShardedComment {
  get blogPost(): ShardedBlogPost | null | Promise<ShardedBlogPost | null>;
  set blogPost(value: ShardedBlogPost | null);
  get blogPostById(): ShardedBlogPost | null | Promise<ShardedBlogPost | null>;
  set blogPostById(value: ShardedBlogPost | null);
  get blogPostWithInverse(): ShardedBlogPost | null | Promise<ShardedBlogPost | null>;
  set blogPostWithInverse(value: ShardedBlogPost | null);
  get blog(): ShardedBlog | null | Promise<ShardedBlog | null>;
  set blog(value: ShardedBlog | null);
}

export class ShardedTag extends Base {
  declare blogPostTags: AssociationProxy<ShardedBlogPostTag>;
  declare blogPosts: AssociationProxy<ShardedBlogPost>;
  declare blog_id: number;
  declare name: string;

  static _tableName = "sharded_tags";

  static {
    queryConstraints.call(this, "blog_id", "id");

    this.hasMany("blogPostTags", {
      className: "ShardedBlogPostTag",
      foreignKey: ["blog_id", "tag_id"],
    });
    this.hasMany("blogPosts", { through: "blogPostTags", className: "ShardedBlogPost" });
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ShardedBlogPostTag extends Base {
  static _tableName = "sharded_blog_posts_tags";

  static {
    queryConstraints.call(this, "blog_id", "id");

    this.belongsTo("blogPost", { className: "ShardedBlogPost" });
    this.belongsTo("tag", { className: "ShardedTag" });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ShardedBlogPostTag {
  get blogPost(): ShardedBlogPost | null | Promise<ShardedBlogPost | null>;
  set blogPost(value: ShardedBlogPost | null);
  get tag(): ShardedTag | null | Promise<ShardedTag | null>;
  set tag(value: ShardedTag | null);
}
