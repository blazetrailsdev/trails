import { Publisher } from "../publisher.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Base } from "../../../base.js";
import { registerModel } from "../../../associations.js";

export class PublisherArticle extends Base {
  static {
    registerModel(rbModConstSet(Publisher, "Article", this));
  }
  static _tableName = "articles";

  static {
    this.hasAndBelongsToMany("magazines");
    this.hasAndBelongsToMany("tags");
  }
}
