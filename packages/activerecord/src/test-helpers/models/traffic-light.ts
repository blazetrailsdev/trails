import type { Temporal } from "@blazetrails/activesupport/temporal";
// vendor/rails/activerecord/test/models/traffic_light.rb
import { Base } from "../../base.js";

export class TrafficLight extends Base {
  declare created_at: Temporal.Instant | Temporal.PlainDateTime;
  declare location: string;
  declare long_state: string;
  declare state: string;
  declare updated_at: Temporal.Instant | Temporal.PlainDateTime;

  static {
    this.serialize("state", { type: "Array" });
    this.serialize("long_state", { type: "Array" });
  }
}
