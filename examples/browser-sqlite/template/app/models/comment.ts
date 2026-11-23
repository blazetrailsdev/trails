import { ApplicationRecord } from "./application-record.ts";
import type { Post } from "./post.ts";

export class Comment extends ApplicationRecord {
  declare author: string;
  declare body: string;
  declare created_at: Date;
  declare post: Post;

  static {
    this.belongsTo("post", { counterCache: true });
    this.validates("author", "body", { presence: true });
  }
}
