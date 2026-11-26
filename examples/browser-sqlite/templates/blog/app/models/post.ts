import { squish } from "@blazetrails/activesupport";
import type { CollectionProxy, Relation } from "@blazetrails/activerecord";
import { ApplicationRecord } from "./application-record.ts";
import type { Comment } from "./comment.ts";

export class Post extends ApplicationRecord {
  declare title: string;
  declare body: string | null;
  declare published: boolean;
  declare comments_count: number;
  declare created_at: Date;
  declare comments: CollectionProxy<Comment>;
  declare static published: () => Relation<Post>;
  declare static recent: () => Relation<Post>;

  static {
    this.hasMany("comments", { dependent: "destroy" });
    this.scope("published", function () {
      return this.where({ published: true }).order({ created_at: "desc" });
    });
    this.scope("recent", function () {
      return this.order({ created_at: "desc" });
    });
    this.validates("title", { presence: true, length: { maximum: 80 } });
    this.validates("body", { length: { maximum: 2000 } });
    this.beforeValidation((post: Post) => {
      post.title = post.title == null ? post.title : squish(post.title);
    });
  }
}
