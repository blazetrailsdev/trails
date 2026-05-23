// vendor/rails/activerecord/test/models/comment_overlapping_counter_cache.rb
import { Base } from "../../base.js";

export class CommentOverlappingCounterCache extends Base {
  static {
    this.belongsTo("userCommentsCount", { counterCache: "comments_count" });
    this.belongsTo("postCommentsCount", { className: "PostCommentsCount" });
    this.belongsTo("commentable", { polymorphic: true, counterCache: "comments_count" });
  }
}

export class UserCommentsCount extends Base {
  static {
    this.hasMany("comments", { as: "commentable", className: "CommentOverlappingCounterCache" });
  }
}

export class PostCommentsCount extends Base {
  static {
    this.hasMany("comments", { className: "CommentOverlappingCounterCache" });
  }
}
