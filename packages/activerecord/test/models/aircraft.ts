import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import type { AssociationProxy } from "../../lib/associations/collection-proxy.js";
import type { Time as RubyTime } from "@blazetrails/date";
import type { Engine } from "./engine.js";
import type { Wheel } from "./wheel.js";
import { Base } from "../../lib/base.js";

export class Aircraft extends Base {
  declare name: string;
  declare manufactured_at: RubyTime | Temporal.PlainDateTime | null;
  declare wheels_count: number;
  declare engines: AssociationProxy<Engine>;
  declare wheels: AssociationProxy<Wheel>;

  static tableName = "aircraft";

  static {
    this.hasMany("engines", { foreignKey: "car_id" });
    this.hasMany("wheels", { as: "wheelable" });
  }
}
constSet(TopLevel, "Aircraft", Aircraft);
DescendantsTracker.registerSubclass(Base, Aircraft);
