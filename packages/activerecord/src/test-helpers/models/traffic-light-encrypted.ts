import { Base } from "../../base.js";
import { TrafficLight } from "./traffic-light.js";
import { registerModel } from "../../associations.js";

export class EncryptedTrafficLight extends TrafficLight {
  static {
    this.encrypts("state");
  }
}
registerModel(EncryptedTrafficLight);

export class EncryptedFirstTrafficLight extends Base {
  static _tableName = "traffic_lights";

  static {
    this.serialize("state", { type: Array });
    this.serialize("long_state", { type: Array });
    this.encrypts("state");
  }
}
registerModel(EncryptedFirstTrafficLight);

export class EncryptedTrafficLightWithStoreState extends TrafficLight {
  static {
    this.store("state", { accessors: ["color"], coder: JSON });
    this.encrypts("state");
  }
}
registerModel(EncryptedTrafficLightWithStoreState);
