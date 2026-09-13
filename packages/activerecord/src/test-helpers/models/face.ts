import type { Human } from "./human.js";
import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class Face extends Base {
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
export interface Face {
  get human(): Human | null | Promise<Human | null>;
  set human(value: Human | null);
  get autosaveHuman(): Human | null | Promise<Human | null>;
  set autosaveHuman(value: Human | null);
  get superHuman(): Base | null | Promise<Base | null>;
  set superHuman(value: Base | null);
  get polymorphicHuman(): Base | null | Promise<Base | null>;
  set polymorphicHuman(value: Base | null);
  get polyHumanWithoutInverse(): Base | null | Promise<Base | null>;
  set polyHumanWithoutInverse(value: Base | null);
  get confusedHuman(): Human | null | Promise<Human | null>;
  set confusedHuman(value: Human | null);
  get puzzledPolymorphicHuman(): Base | null | Promise<Base | null>;
  set puzzledPolymorphicHuman(value: Base | null);
}
registerModel(Face);
