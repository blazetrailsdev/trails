import type { AssociationProxy } from "../../associations/collection-proxy.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CommentOverlappingCounterCache extends Base {
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
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CommentOverlappingCounterCache {
  get userCommentsCount(): UserCommentsCount | null | Promise<UserCommentsCount | null>;
  set userCommentsCount(value: UserCommentsCount | null);
  get postCommentsCount(): PostCommentsCount | null | Promise<PostCommentsCount | null>;
  set postCommentsCount(value: PostCommentsCount | null);
  get commentable(): Base | null | Promise<Base | null>;
  set commentable(value: Base | null);
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
