import type { Article } from "./article.js";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { ClassMethods as Broadcasts } from "../../../../lib/app/models/concerns/turbo/broadcastable.js";
import { ApplicationRecord } from "./application-record.js";

export class Comment extends ApplicationRecord {
  declare body: string;
  declare article_id: number;
  declare article: Article;

  static {
    this.belongsTo("article");

    this.validates("body", { presence: true });

    (this as unknown as typeof Broadcasts).broadcastsTo.call(
      this as never,
      (comment: Comment) => [comment.article, "comments"],
      {
        target: (comment: Comment) => `article_${comment.article_id}_comments`,
        partial: "comments/different_comment",
        locals: { highlight: true },
      },
    );
  }
}
constSet(TopLevel, "Comment", Comment);
