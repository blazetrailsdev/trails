import { Base } from "../../base.js";

export class Wheel extends Base {
  declare wheelable: Base | null | Promise<Base | null>;
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

export class WheelPolymorphicTouch extends Base {
  declare wheelable: Base | null | Promise<Base | null>;
  declare wheelable_id: number;
  declare wheelable_type: string;

  static {
    this.tableName = "wheels";
    this.belongsTo("wheelable", { polymorphic: true, touch: true });
  }
}
