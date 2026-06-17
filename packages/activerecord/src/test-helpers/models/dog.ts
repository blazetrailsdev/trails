import type { DogLover } from "./dog-lover.js";
// vendor/rails/activerecord/test/models/dog.rb
import { Base } from "../../base.js";

export class Dog extends Base {
  declare breeder: DogLover | null;
  declare trainer: DogLover | null;
  declare doglover: DogLover | null;
  declare loadBelongsTo: ((name: "breeder") => Promise<DogLover | null>) &
    ((name: "trainer") => Promise<DogLover | null>) &
    ((name: "doglover") => Promise<DogLover | null>);
  declare alias: string;
  declare breeder_id: number;
  declare dog_lover_id: number;
  declare trainer_id: number;

  static {
    this.belongsTo("breeder", { className: "DogLover", counterCache: "bred_dogs_count" });
    this.belongsTo("trainer", { className: "DogLover", counterCache: "trained_dogs_count" });
    this.belongsTo("doglover", {
      foreignKey: "dog_lover_id",
      className: "DogLover",
      counterCache: true,
    });
  }
}
