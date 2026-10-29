import { include, type Included } from "@blazetrails/activesupport";
import type { Base, Relation, ScopeMethod, ScopeOn } from "@blazetrails/activerecord";
import { ApplicationRecord } from "./application-record.ts";
import { Likeable } from "./concerns/post/likeable.ts";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface Post extends Included<typeof Likeable> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Post extends ApplicationRecord {
  declare static withDetails: ScopeMethod<Post>;
  declare static newestFirst: ScopeMethod<Post>;

  declare id: number;
  declare user_id: number;
  declare body: string;
  declare created_at: string;
  declare author: string;
  declare like_count: number;

  static {
    include(this, Likeable);

    this.belongsTo("user");

    this.attribute("author", "string");
    this.attribute("like_count", "integer", { default: 0 });

    this.normalizes("body", { with: (body: string) => body.trim() });

    this.validates("body", {
      presence: { message: "body is required" },
      length: { maximum: 500, message: "body must be at most 500 characters" },
    });

    this.scope("withDetails", function (this: Relation<Post>) {
      return this.joins(":user")
        .select("posts.id, posts.body, posts.created_at, users.username AS author")
        .select("(SELECT count(*) FROM likes WHERE likes.post_id = posts.id) AS like_count");
    });
    this.scope("newestFirst", function (this: Relation<Post>) {
      return this.order({ created_at: "desc", id: "desc" });
    });
  }

  asJson() {
    return {
      id: this.id,
      body: this.body,
      created_at: this.created_at,
      author: this.author,
      like_count: this.like_count,
    };
  }
}

declare module "@blazetrails/activerecord" {
  interface RelationScopes<T extends Base> {
    withDetails: ScopeOn<T, Post>;
    newestFirst: ScopeOn<T, Post>;
  }
}
