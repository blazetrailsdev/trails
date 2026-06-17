import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Dog } from "./dog.js";
// vendor/rails/activerecord/test/models/dog_lover.rb
import { Base } from "../../base.js";

export class DogLover extends Base {
  declare trainedDogs: AssociationProxy<Dog>;
  declare bredDogs: AssociationProxy<Dog>;
  declare dogs: AssociationProxy<Dog>;
  declare bred_dogs_count: number | null;
  declare dogs_count: number | null;
  declare trained_dogs_count: number | null;

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
