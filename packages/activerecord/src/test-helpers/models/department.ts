import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Chef } from "./chef.js";
import type { Hotel } from "./hotel.js";
import { Base } from "../../base.js";

export class Department extends Base {
  declare chefs: AssociationProxy<Chef>;
  declare hotel_id: number;

  static {
    this.hasMany("chefs");
    this.belongsTo("hotel");
  }
}
export interface Department {
  get hotel(): Hotel | null | Promise<Hotel | null>;
  set hotel(value: Hotel | null);
}
