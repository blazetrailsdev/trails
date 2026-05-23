// vendor/rails/activerecord/test/models/electron.rb
import { Base } from "../../base.js";

export class Electron extends Base {
  static {
    this.belongsTo("molecule");

    this.validatesPresenceOf("name");
  }
}
