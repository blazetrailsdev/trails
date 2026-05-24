// vendor/rails/activerecord/test/models/face.rb
import { Base } from "../../base.js";

export class Face extends Base {
  static {
    this.belongsTo("human", { inverseOf: "face" });
    this.belongsTo("autosaveHuman", {
      className: "Human",
      foreignKey: "human_id",
      inverseOf: "autosaveFace",
    });
    this.belongsTo("superHuman", { polymorphic: true });
    this.belongsTo("polymorphicHuman", { polymorphic: true, inverseOf: "polymorphicFace" });
    this.belongsTo("polyHumanWithoutInverse", { polymorphic: true });
    this.belongsTo("confusedHuman", { className: "Human", inverseOf: "cnffusedFace" });
    this.belongsTo("puzzledPolymorphicHuman", {
      polymorphic: true,
      inverseOf: "puzzledPolymorphicFace",
    });

    this.validate(function (this: Face) {
      void (this as any).human;
    });
  }
}
