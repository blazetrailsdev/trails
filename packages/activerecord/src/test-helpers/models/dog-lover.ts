// vendor/rails/activerecord/test/models/dog_lover.rb
import { Base } from "../../base.js";

export class DogLover extends Base {
  static {
    this.hasMany("trainedDogs", {
      className: "Dog",
      foreignKey: "trainer_id",
      dependent: "destroy",
    });
    this.hasMany("bredDogs", { className: "Dog", foreignKey: "breeder_id" });
    this.hasMany("dogs");
  }
}
