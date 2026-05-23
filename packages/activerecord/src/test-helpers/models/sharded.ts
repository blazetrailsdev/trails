// vendor/rails/activerecord/test/models/sharded/
import { Base } from "../../base.js";
import { queryConstraints } from "../../persistence.js";

// sharded/blog.rb
export class ShardedBlog extends Base {
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
  static _tableName = "sharded_blog_posts_tags";

  static {
    queryConstraints.call(this, "blog_id", "id");

    this.belongsTo("blogPost", { className: "ShardedBlogPost" });
    this.belongsTo("tag", { className: "ShardedTag" });
  }
}
