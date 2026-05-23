// vendor/rails/activerecord/test/models/subscription.rb
import { Base } from "../../base.js";

export class Subscription extends Base {
  // Rails: self.automatically_invert_plural_associations = true — not yet implemented in TS

  static {
    this.belongsTo("subscriber", { counterCache: "books_count" });
    this.belongsTo("book");
    this.validatesPresenceOf("subscriber_id", "book_id");
  }
}
