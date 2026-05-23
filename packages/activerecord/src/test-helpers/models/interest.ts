// vendor/rails/activerecord/test/models/interest.rb
import { Base } from "../../base.js";

export class Interest extends Base {
  static {
    this.belongsTo("human", { inverseOf: "interests" });
    this.belongsTo("humanWithCallbacks", {
      className: "Human",
      foreignKey: "human_id",
      inverseOf: "interestsWithCallbacks",
    });
    this.belongsTo("polymorphicHuman", { polymorphic: true, inverseOf: "polymorphicInterests" });
    this.belongsTo("polymorphicHumanWithCallbacks", {
      foreignKey: "polymorphic_human_id",
      foreignType: "polymorphic_human_type",
      polymorphic: true,
      inverseOf: "polymorphicInterestsWithCallbacks",
    });
    this.belongsTo("zine", { inverseOf: "interests" });
  }
}
