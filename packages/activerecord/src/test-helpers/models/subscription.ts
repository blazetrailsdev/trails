import type { Book } from "./book.js";
import type { Subscriber } from "./subscriber.js";
// vendor/rails/activerecord/test/models/subscription.rb
import { Base } from "../../base.js";

export class Subscription extends Base {
  declare subscriber: Subscriber | null;
  declare book: Book | null;
  declare loadBelongsTo: ((name: "subscriber") => Promise<Subscriber | null>) &
    ((name: "book") => Promise<Book | null>);
  declare book_id: number;
  declare subscriber_id: string;

  // Rails: self.automatically_invert_plural_associations = true — not yet implemented in TS

  static {
    this.belongsTo("subscriber", { counterCache: "books_count" });
    this.belongsTo("book");
    this.validatesPresenceOf("subscriber_id", "book_id");
  }
}
