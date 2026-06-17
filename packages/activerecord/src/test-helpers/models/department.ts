import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Chef } from "./chef.js";
import type { Hotel } from "./hotel.js";
// vendor/rails/activerecord/test/models/department.rb
import { Base } from "../../base.js";

export class Department extends Base {
  declare chefs: AssociationProxy<Chef>;
  declare hotel: Hotel | null;
  declare loadBelongsTo: (name: "hotel") => Promise<Hotel | null>;
  declare hotel_id: number;

  static {
    this.hasMany("chefs");
    this.belongsTo("hotel");
  }
}
