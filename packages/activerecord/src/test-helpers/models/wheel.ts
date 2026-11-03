import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Wheel extends Base {
  declare size: number;
  declare wheelable_id: number;
  declare wheelable_type: string;

  static {
    this.belongsTo("wheelable", {
      polymorphic: true,
      counterCache: true,
      touch: "wheels_owned_at",
    });
  }
}
constSet(TopLevel, "Wheel", Wheel);
DescendantsTracker.registerSubclass(Base, Wheel);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Wheel {
  get wheelable(): Base | null | Promise<Base | null>;
  set wheelable(value: Base | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class WheelPolymorphicTouch extends Base {
  declare wheelable_id: number;
  declare wheelable_type: string;

  static {
    this.tableName = "wheels";
    this.belongsTo("wheelable", { polymorphic: true, touch: true });
  }
}
constSet(TopLevel, "WheelPolymorphicTouch", WheelPolymorphicTouch);
DescendantsTracker.registerSubclass(Base, WheelPolymorphicTouch);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface WheelPolymorphicTouch {
  get wheelable(): Base | null | Promise<Base | null>;
  set wheelable(value: Base | null);
}
