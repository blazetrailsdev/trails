// vendor/rails/activerecord/test/models/string_key_object.rb
import { Base } from "../../base.js";

export class StringKeyObject extends Base {
  declare lock_version: number;
  declare name: string;

  static _primaryKey = "id";
}
