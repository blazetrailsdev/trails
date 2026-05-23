// vendor/rails/activerecord/test/models/other_dog.rb
import { Base } from "../../base.js";

class ARUnit2Model extends Base {
  static {
    this._abstractClass = true;
  }
}

export class OtherDog extends ARUnit2Model {
  static {
    this._tableName = "dogs";
  }
}
