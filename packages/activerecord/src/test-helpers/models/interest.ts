import type { Human } from "./human.js";
import type { Zine } from "./zine.js";
// vendor/rails/activerecord/test/models/interest.rb
import { Base } from "../../base.js";

export class Interest extends Base {
  declare human: Human | null;
  declare humanWithCallbacks: Human | null;
  declare polymorphicHuman: Base | null;
  declare polymorphicHumanWithCallbacks: Base | null;
  declare zine: Zine | null;
  declare loadBelongsTo: ((name: "human") => Promise<Human | null>) &
    ((name: "humanWithCallbacks") => Promise<Human | null>) &
    ((name: "polymorphicHuman") => Promise<Base | null>) &
    ((name: "polymorphicHumanWithCallbacks") => Promise<Base | null>) &
    ((name: "zine") => Promise<Zine | null>);
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
