import { ARUnit2Model } from "./arunit2-model.js";
import { registerModel } from "../../associations.js";

export class Professor extends ARUnit2Model {
  static {
    this.hasAndBelongsToMany("courses");
  }
}
registerModel(Professor);
