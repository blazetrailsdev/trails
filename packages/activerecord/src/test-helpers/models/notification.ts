// vendor/rails/activerecord/test/models/notification.rb
import { Base } from "../../base.js";

export class Notification extends Base {
  static {
    this.validates("message", { presence: true });
  }
}
