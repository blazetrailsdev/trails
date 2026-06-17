// vendor/rails/activerecord/test/models/wheel.rb
import { Base } from "../../base.js";

export class Wheel extends Base {
  declare wheelable: Base | null;
  declare loadBelongsTo: (name: "wheelable") => Promise<Base | null>;
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
