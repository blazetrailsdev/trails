import type { Tagging } from "./tagging.js";
// vendor/rails/activerecord/test/models/item.rb
import { Base } from "../../base.js";

export class AbstractItem extends Base {
  declare tagging: Tagging | null;
  declare loadHasOne: (name: "tagging") => Promise<Tagging | null>;

  static {
    this.abstractClass = true;
    this.hasOne("tagging", { as: "taggable" });
  }
}

export class Item extends AbstractItem {
  declare name: string;
}
