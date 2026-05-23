// vendor/rails/activerecord/test/models/traffic_light.rb
import { Base } from "../../base.js";

export class TrafficLight extends Base {
  static {
    this.serialize("state", { type: "Array" });
    this.serialize("long_state", { type: "Array" });
  }
}
