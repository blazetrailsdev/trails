import type { Tagging } from "./tagging.js";
import { Base } from "../../base.js";

export class AbstractItem extends Base {
  static {
    this.abstractClass = true;
    this.hasOne("tagging", { as: "taggable" });
  }
}
export interface AbstractItem {
  get tagging(): Tagging | null | Promise<Tagging | null>;
  set tagging(value: Tagging | null);
}

export class Item extends AbstractItem {
  declare name: string;
}
