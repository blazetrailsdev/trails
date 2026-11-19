import type { Article } from "./article.js";
import { TopLevel } from "@blazetrails/ruby-compat";
import { ApplicationRecord } from "./application-record.js";

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    Comment?: typeof Comment;
  }
}

export class Comment extends ApplicationRecord {
  declare body: string;
  declare article_id: number;
  declare article: Article;

  static {
    this.belongsTo("article");

    this.validates("body", { presence: true });

    this.broadcastsTo((comment: Comment) => [comment.article, "comments"], {
      target: (comment: Comment) => `article_${comment.article_id}_comments`,
      partial: "comments/different_comment",
      locals: { highlight: true },
    });
  }
}
TopLevel.Comment = Comment;
