import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Temporal, Time as RubyTime } from "@blazetrails/date";
import type { Engine } from "./engine.js";
import type { Wheel } from "./wheel.js";
import { Base } from "../../base.js";

export class Aircraft extends Base {
  declare name: string;
  declare manufactured_at: RubyTime | Temporal.PlainDateTime | null;
  declare wheels_count: number;
  declare engines: AssociationProxy<Engine>;
  declare wheels: AssociationProxy<Wheel>;

  static _tableName = "aircraft";

  static {
    this.hasMany("engines", { foreignKey: "car_id" });
    this.hasMany("wheels", { as: "wheelable" });
  }
}
