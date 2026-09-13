import type { Human } from "./human.js";
import type { Zine } from "./zine.js";
import { Base } from "../../base.js";

export class Interest extends Base {
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
export interface Interest {
  get human(): Human | null | Promise<Human | null>;
  set human(value: Human | null);
  get humanWithCallbacks(): Human | null | Promise<Human | null>;
  set humanWithCallbacks(value: Human | null);
  get polymorphicHuman(): Base | null | Promise<Base | null>;
  set polymorphicHuman(value: Base | null);
  get polymorphicHumanWithCallbacks(): Base | null | Promise<Base | null>;
  set polymorphicHumanWithCallbacks(value: Base | null);
  get zine(): Zine | null | Promise<Zine | null>;
  set zine(value: Zine | null);
}
