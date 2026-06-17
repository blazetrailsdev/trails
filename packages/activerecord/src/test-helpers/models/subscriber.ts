import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Book } from "./book.js";
import type { Subscription } from "./subscription.js";
// vendor/rails/activerecord/test/models/subscriber.rb
import { Base } from "../../base.js";

export class Subscriber extends Base {
  declare subscriptions: AssociationProxy<Subscription>;
  declare books: AssociationProxy<Book>;
  declare books_count: number;
  declare name: string;
  declare nick: string;
  declare update_count: number;

  static _primaryKey = "nick";

  static {
    this.hasMany("subscriptions");
    this.hasMany("books", { through: "subscriptions" });
  }
}

export class SpecialSubscriber extends Subscriber {}
