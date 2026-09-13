import type { Temporal, Time as RubyTime } from "@blazetrails/date";
import type { Developer } from "./developer.js";
import type { Firm } from "./company.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Computer extends Base {
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
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Computer {
  get developer(): Developer | null | Promise<Developer | null>;
  set developer(value: Developer | null);
  get firm(): Firm | null | Promise<Firm | null>;
  set firm(value: Firm | null);
}
