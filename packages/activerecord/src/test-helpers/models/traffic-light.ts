import type { Temporal, Time as RubyTime } from "@blazetrails/date";
import { Base } from "../../base.js";

export class TrafficLight extends Base {
  declare created_at: RubyTime | Temporal.PlainDateTime;
  declare location: string;
  declare long_state: string;
  declare state: string;
  declare updated_at: RubyTime | Temporal.PlainDateTime;

  static {
    this.serialize("state", { type: Array });
    this.serialize("long_state", { type: Array });
  }
}
