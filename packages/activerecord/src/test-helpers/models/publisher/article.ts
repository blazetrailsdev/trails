import { Base } from "../../../base.js";

export class PublisherArticle extends Base {
  static moduleName = "Publisher";
  static _demodulizedName = "Article";
  static _tableName = "articles";

  static {
    this.hasAndBelongsToMany("magazines");
    this.hasAndBelongsToMany("tags");
  }
}
