import type { Human } from "./human.js";
import type { Zine } from "./zine.js";
import { Base } from "../../base.js";

export class Interest extends Base {
  declare human: Human | null | Promise<Human | null>;
  declare humanWithCallbacks: Human | null | Promise<Human | null>;
  declare polymorphicHuman: Base | null | Promise<Base | null>;
  declare polymorphicHumanWithCallbacks: Base | null | Promise<Base | null>;
  declare zine: Zine | null | Promise<Zine | null>;
  declare human_id: number;
  declare polymorphic_human_id: number;
  declare polymorphic_human_type: string;
  declare topic: string;
  declare zine_id: number;

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
