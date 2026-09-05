import type { Temporal, Time as RubyTime } from "@blazetrails/date";
import type { Developer } from "./developer.js";
import type { Firm } from "./company.js";
import { Base } from "../../base.js";

export class Computer extends Base {
  declare developer: Developer | null;
  declare firm: Firm | null;
  declare loadBelongsTo: (name: "developer") => Promise<Developer | null>;
  declare loadHasOne: (name: "firm") => Promise<Firm | null>;
  declare created_at: RubyTime | Temporal.PlainDateTime;
  declare extendedWarranty: number;
  declare system: string;
  declare timezone: number;
  declare updated_at: RubyTime | Temporal.PlainDateTime;

  static {
    this.belongsTo("developer", { foreignKey: "developer" });
    this.hasOne("firm", { through: "developer" });
  }
}
