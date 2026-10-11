import { ARUnit2Model } from "./arunit2-model.js";
import { registerModel } from "../../associations.js";

export class Course extends ARUnit2Model {
  declare name: string;
  static {
    this.belongsTo("college");
    this.hasMany("entrants");
  }
}
registerModel(Course);
