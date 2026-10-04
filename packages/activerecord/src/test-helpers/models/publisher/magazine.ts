import { Publisher } from "../publisher.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Base } from "../../../base.js";

export class PublisherMagazine extends Base {
  static {
    rbModConstSet(Publisher, "Magazine", this);
  }
  static _tableName = "magazines";

  static {
    this.hasAndBelongsToMany("articles");
  }
}
