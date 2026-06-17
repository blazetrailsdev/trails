// vendor/rails/activerecord/test/models/event.rb
import { Base } from "../../base.js";

export class Event extends Base {
  declare title: string | null;

  static {
    this.validates("title", { uniqueness: true });
  }
}
