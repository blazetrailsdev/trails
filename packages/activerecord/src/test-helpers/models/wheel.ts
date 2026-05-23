// vendor/rails/activerecord/test/models/wheel.rb
import { Base } from "../../base.js";

export class Wheel extends Base {
  static {
    this.belongsTo("wheelable", {
      polymorphic: true,
      counterCache: true,
      touch: "wheels_owned_at",
    });
  }
}
