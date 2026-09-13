import type { DogLover } from "./dog-lover.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Dog extends Base {
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
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Dog {
  get breeder(): DogLover | null | Promise<DogLover | null>;
  set breeder(value: DogLover | null);
  get trainer(): DogLover | null | Promise<DogLover | null>;
  set trainer(value: DogLover | null);
  get doglover(): DogLover | null | Promise<DogLover | null>;
  set doglover(value: DogLover | null);
}
