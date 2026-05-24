// vendor/rails/activerecord/test/models/event.rb
import { Base } from "../../base.js";

export class Event extends Base {
  static {
    this.validates("title", { uniqueness: true });
  }
}
