import { Publisher } from "../publisher.js";
import { constSet } from "@blazetrails/ruby-compat";
import { Base } from "../../../base.js";
import { registerModel } from "../../../associations.js";

export class PublisherArticle extends Base {
  static {
    registerModel(constSet(Publisher, "Article", this));
  }
  static _tableName = "articles";

  static {
    this.hasAndBelongsToMany("magazines");
    this.hasAndBelongsToMany("tags");
  }
}
