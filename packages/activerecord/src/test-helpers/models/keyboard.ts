// vendor/rails/activerecord/test/models/keyboard.rb
import { Base } from "../../base.js";

export class Keyboard extends Base {
  declare key_number: number;
  declare name: string;

  static _primaryKey = "key_number";
}
