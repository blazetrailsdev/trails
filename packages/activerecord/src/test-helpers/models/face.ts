import type { Human } from "./human.js";
// vendor/rails/activerecord/test/models/face.rb
import { Base } from "../../base.js";

export class Face extends Base {
  declare human: Human | null;
  declare autosaveHuman: Human | null;
  declare superHuman: Base | null;
  declare polymorphicHuman: Base | null;
  declare polyHumanWithoutInverse: Base | null;
  declare confusedHuman: Human | null;
  declare puzzledPolymorphicHuman: Base | null;
  declare loadBelongsTo: ((name: "human") => Promise<Human | null>) &
    ((name: "autosaveHuman") => Promise<Human | null>) &
    ((name: "superHuman") => Promise<Base | null>) &
    ((name: "polymorphicHuman") => Promise<Base | null>) &
    ((name: "polyHumanWithoutInverse") => Promise<Base | null>) &
    ((name: "confusedHuman") => Promise<Human | null>) &
    ((name: "puzzledPolymorphicHuman") => Promise<Base | null>);
  declare description: string;
  declare human_id: number;
  declare poly_human_without_inverse_id: number;
  declare poly_human_without_inverse_type: string;
  declare polymorphic_human_id: number;
  declare polymorphic_human_type: string;
  declare puzzled_polymorphic_human_id: number;
  declare puzzled_polymorphic_human_type: string;
  declare super_human_id: number;
  declare super_human_type: string;

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

    this.validate((face: Face) => {
      void (face as any).human;
    });
  }
}
