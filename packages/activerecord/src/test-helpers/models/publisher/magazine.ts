import { Base } from "../../../base.js";

export class PublisherMagazine extends Base {
  static moduleName = "Publisher";
  static _demodulizedName = "Magazine";
  static _tableName = "magazines";

  static {
    this.hasAndBelongsToMany("articles");
  }
}
