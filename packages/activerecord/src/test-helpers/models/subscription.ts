// vendor/rails/activerecord/test/models/subscription.rb
import { Base } from "../../base.js";

export class Subscription extends Base {
  static {
    this.belongsTo("subscriber", { counterCache: "books_count" });
    this.belongsTo("book");
    this.validatesPresenceOf("subscriberId", "bookId");
  }
}
