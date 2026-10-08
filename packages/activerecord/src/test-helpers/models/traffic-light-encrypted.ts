import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { TrafficLight } from "./traffic-light.js";

export class EncryptedTrafficLight extends TrafficLight {
  static {
    this.encrypts("state");
  }
}
registerConstant("EncryptedTrafficLight", EncryptedTrafficLight);

export class EncryptedFirstTrafficLight extends Base {
  static _tableName = "traffic_lights";

  static {
    this.serialize("state", { type: Array });
    this.serialize("long_state", { type: Array });
    this.encrypts("state");
  }
}
registerConstant("EncryptedFirstTrafficLight", EncryptedFirstTrafficLight);

export class EncryptedTrafficLightWithStoreState extends TrafficLight {
  static {
    this.store("state", { accessors: ["color"], coder: JSON });
    this.encrypts("state");
  }
}
registerConstant("EncryptedTrafficLightWithStoreState", EncryptedTrafficLightWithStoreState);
