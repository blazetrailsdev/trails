import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { ApplicationRecord } from "./application-record.js";

export class Comment extends ApplicationRecord {
  declare body: string;
  declare article_id: number;

  static {
    this.belongsTo("article");

    this.validates("body", { presence: true });
  }
}
constSet(TopLevel, "Comment", Comment);
