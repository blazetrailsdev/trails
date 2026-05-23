// vendor/rails/activerecord/test/models/publisher/article.rb
import { Base } from "../../../base.js";

export class PublisherArticle extends Base {
  static _tableName = "articles";

  static {
    this.hasAndBelongsToMany("magazines", { className: "PublisherMagazine" });
    this.hasAndBelongsToMany("tags");
  }
}
