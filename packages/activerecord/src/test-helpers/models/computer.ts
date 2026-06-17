import type { Temporal } from "@blazetrails/activesupport/temporal";
import type { Developer } from "./developer.js";
import type { Firm } from "./company.js";
// vendor/rails/activerecord/test/models/computer.rb
import { Base } from "../../base.js";

export class Computer extends Base {
  declare developer: Developer | null;
  declare firm: Firm | null;
  declare loadBelongsTo: (name: "developer") => Promise<Developer | null>;
  declare loadHasOne: (name: "firm") => Promise<Firm | null>;
  declare created_at: Temporal.Instant | Temporal.PlainDateTime;
  declare extendedWarranty: number;
  declare system: string;
  declare timezone: number;
  declare updated_at: Temporal.Instant | Temporal.PlainDateTime;

  static {
    this.belongsTo("developer", { foreignKey: "developer" });
    this.hasOne("firm", { through: "developer" });
  }
}
