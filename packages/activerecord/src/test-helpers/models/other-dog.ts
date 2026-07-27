// vendor/rails/activerecord/test/models/other_dog.rb
import { ARUnit2Model } from "./arunit2-model.js";

export class OtherDog extends ARUnit2Model {
  static {
    this._tableName = "dogs";
  }
}
