// vendor/rails/activerecord/test/models/mouse.rb
import { Base } from "../../base.js";

export class Mouse extends Base {
  static {
    this.hasMany("squeaks", { autosave: true });
    this.validates("name", { presence: true });
  }
}
