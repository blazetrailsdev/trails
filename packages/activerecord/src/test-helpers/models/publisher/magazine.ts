// vendor/rails/activerecord/test/models/publisher/magazine.rb
import { Base } from "../../../base.js";

export class PublisherMagazine extends Base {
  static _tableName = "magazines";

  static {
    this.hasAndBelongsToMany("articles", { className: "PublisherArticle" });
  }
}
