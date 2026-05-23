// vendor/rails/activerecord/test/models/item.rb
import { Base } from "../../base.js";

export class AbstractItem extends Base {
  static {
    this.abstractClass = true;
    this.hasOne("tagging", { as: "taggable" });
  }
}

export class Item extends AbstractItem {}
