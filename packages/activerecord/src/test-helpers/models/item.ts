import type { Tagging } from "./tagging.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AbstractItem extends Base {
  static {
    this.abstractClass = true;
    this.hasOne("tagging", { as: "taggable" });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface AbstractItem {
  get tagging(): Tagging | null | Promise<Tagging | null>;
  set tagging(value: Tagging | null);
}

export class Item extends AbstractItem {
  declare name: string;
}
