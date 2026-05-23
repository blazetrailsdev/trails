// vendor/rails/activerecord/test/models/subscriber.rb
import { Base } from "../../base.js";

export class Subscriber extends Base {
  static _primaryKey = "nick";

  static {
    this.hasMany("subscriptions");
    this.hasMany("books", { through: "subscriptions" });
  }
}

export class SpecialSubscriber extends Subscriber {}
