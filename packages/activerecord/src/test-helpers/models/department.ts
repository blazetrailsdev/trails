import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Chef } from "./chef.js";
import type { Hotel } from "./hotel.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Department extends Base {
  declare chefs: AssociationProxy<Chef>;
  declare hotel_id: number;

  static {
    this.hasMany("chefs");
    this.belongsTo("hotel");
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Department {
  get hotel(): Hotel | null | Promise<Hotel | null>;
  set hotel(value: Hotel | null);
}
