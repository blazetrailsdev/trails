import type { Tagging } from "./tagging.js";
import { Base } from "../../base.js";

export class AbstractItem extends Base {
  declare tagging: Tagging | null | Promise<Tagging | null>;

  static {
    this.abstractClass = true;
    this.hasOne("tagging", { as: "taggable" });
  }
}

export class Item extends AbstractItem {
  declare name: string;
}
