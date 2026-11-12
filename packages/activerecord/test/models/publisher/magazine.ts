import { DescendantsTracker } from "@blazetrails/activesupport";
import { Publisher } from "../publisher.js";
import { constSet } from "@blazetrails/ruby-compat";
import { Base } from "../../../lib/base.js";

export class PublisherMagazine extends Base {
  static {
    constSet(Publisher, "Magazine", this);
    DescendantsTracker.registerSubclass(Base, this);
  }
  static _tableName = "magazines";

  static {
    this.hasAndBelongsToMany("articles");
  }
}
