import type { AssociationProxy } from "../../associations/collection-proxy.js";
// vendor/rails/activerecord/test/models/comment_overlapping_counter_cache.rb
import { Base } from "../../base.js";

export class CommentOverlappingCounterCache extends Base {
  declare userCommentsCount: UserCommentsCount | null;
  declare postCommentsCount: PostCommentsCount | null;
  declare commentable: Base | null;
  declare loadBelongsTo: ((name: "userCommentsCount") => Promise<UserCommentsCount | null>) &
    ((name: "postCommentsCount") => Promise<PostCommentsCount | null>) &
    ((name: "commentable") => Promise<Base | null>);
  declare commentable_id: number;
  declare commentable_type: string;
  declare post_comments_count_id: number;
  declare user_comments_count_id: number;

  static {
    this.belongsTo("userCommentsCount", { counterCache: "comments_count" });
    this.belongsTo("postCommentsCount", { className: "PostCommentsCount" });
    this.belongsTo("commentable", { polymorphic: true, counterCache: "comments_count" });
  }
}

export class UserCommentsCount extends Base {
  declare comments: AssociationProxy<CommentOverlappingCounterCache>;
  declare comments_count: number | null;

  static {
    this.hasMany("comments", { as: "commentable", className: "CommentOverlappingCounterCache" });
  }
}

export class PostCommentsCount extends Base {
  declare comments: AssociationProxy<CommentOverlappingCounterCache>;
  declare comments_count: number | null;

  static {
    this.hasMany("comments", { className: "CommentOverlappingCounterCache" });
  }
}
