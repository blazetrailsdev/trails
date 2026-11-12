import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../lib/base.js";
import { TrafficLight } from "./traffic-light.js";

export class EncryptedTrafficLight extends TrafficLight {
  static {
    this.encrypts("state");
  }
}
constSet(TopLevel, "EncryptedTrafficLight", EncryptedTrafficLight);
DescendantsTracker.registerSubclass(TrafficLight, EncryptedTrafficLight);

export class EncryptedFirstTrafficLight extends Base {
  static _tableName = "traffic_lights";

  static {
    this.serialize("state", { type: Array });
    this.serialize("long_state", { type: Array });
    this.encrypts("state");
  }
}
constSet(TopLevel, "EncryptedFirstTrafficLight", EncryptedFirstTrafficLight);
DescendantsTracker.registerSubclass(Base, EncryptedFirstTrafficLight);

export class EncryptedTrafficLightWithStoreState extends TrafficLight {
  static {
    this.store("state", { accessors: ["color"], coder: JSON });
    this.encrypts("state");
  }
}
constSet(TopLevel, "EncryptedTrafficLightWithStoreState", EncryptedTrafficLightWithStoreState);
DescendantsTracker.registerSubclass(TrafficLight, EncryptedTrafficLightWithStoreState);
