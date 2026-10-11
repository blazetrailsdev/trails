import { ARUnit2Model } from "./arunit2-model.js";
import { registerModel } from "../../associations.js";

export class OtherDog extends ARUnit2Model {
  static {
    this._tableName = "dogs";
  }
}
registerModel(OtherDog);
