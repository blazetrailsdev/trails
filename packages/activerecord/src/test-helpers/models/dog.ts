// vendor/rails/activerecord/test/models/dog.rb
import { Base } from "../../base.js";

export class Dog extends Base {
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
