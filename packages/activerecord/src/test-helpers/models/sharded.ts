import type { AssociationProxy } from "../../associations/collection-proxy.js";
// vendor/rails/activerecord/test/models/sharded/
import { Base } from "../../base.js";
import { queryConstraints } from "../../persistence.js";

// sharded/blog.rb
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

// sharded/blog_post.rb
export class ShardedBlogPost extends Base {
  declare parent: Base | null;
  declare blog: ShardedBlog | null;
  declare comments: AssociationProxy<ShardedComment>;
  declare deleteComments: AssociationProxy<ShardedComment>;
  declare children: AssociationProxy<ShardedBlogPost>;
  declare blogPostTags: AssociationProxy<ShardedBlogPostTag>;
  declare tags: AssociationProxy<ShardedTag>;
  declare commentsWithCompositePk: AssociationProxy<ShardedComment>;
  declare commentsWithInverse: AssociationProxy<ShardedComment>;
  declare loadBelongsTo: ((name: "parent") => Promise<Base | null>) &
    ((name: "blog") => Promise<ShardedBlog | null>);
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
    // Rails: dependent: :delete_all — "deleteAll" not yet in AssociationOptions.dependent type
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

// sharded/blog_post_with_revision.rb
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

// sharded/comment.rb
export class ShardedComment extends Base {
  declare blogPost: ShardedBlogPost | null;
  declare blogPostById: ShardedBlogPost | null;
  declare blogPostWithInverse: ShardedBlogPost | null;
  declare blog: ShardedBlog | null;
  declare loadBelongsTo: ((name: "blogPost") => Promise<ShardedBlogPost | null>) &
    ((name: "blogPostById") => Promise<ShardedBlogPost | null>) &
    ((name: "blogPostWithInverse") => Promise<ShardedBlogPost | null>) &
    ((name: "blog") => Promise<ShardedBlog | null>);
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

// sharded/tag.rb
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

// sharded/blog_post_tag.rb
export class ShardedBlogPostTag extends Base {
  declare blogPost: ShardedBlogPost | null;
  declare tag: ShardedTag | null;
  declare loadBelongsTo: ((name: "blogPost") => Promise<ShardedBlogPost | null>) &
    ((name: "tag") => Promise<ShardedTag | null>);

  static _tableName = "sharded_blog_posts_tags";

  static {
    queryConstraints.call(this, "blog_id", "id");

    this.belongsTo("blogPost", { className: "ShardedBlogPost" });
    this.belongsTo("tag", { className: "ShardedTag" });
  }
}
