// vendor/rails/activerecord/test/models/doubloon.rb
import { Base } from "../../base.js";

export class AbstractDoubloon extends Base {
  static abstractClass = true;

  static {
    this.belongsTo("pirate");
  }
}

export class Doubloon extends AbstractDoubloon {
  static _tableName = "doubloons";
}
