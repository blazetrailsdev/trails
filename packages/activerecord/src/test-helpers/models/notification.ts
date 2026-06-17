// vendor/rails/activerecord/test/models/notification.rb
import { Base } from "../../base.js";

export class Notification extends Base {
  declare message: string;

  static {
    this.validates("message", { presence: true });
  }
}
