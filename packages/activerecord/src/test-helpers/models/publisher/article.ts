import { DescendantsTracker } from "@blazetrails/activesupport";
import { Publisher } from "../publisher.js";
import { constSet } from "@blazetrails/ruby-compat";
import { Base } from "../../../base.js";

export class PublisherArticle extends Base {
  static {
    constSet(Publisher, "Article", this);
    DescendantsTracker.registerSubclass(Base, this);
  }
  static _tableName = "articles";

  static {
    this.hasAndBelongsToMany("magazines");
    this.hasAndBelongsToMany("tags");
  }
}
