import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Book } from "./book.js";
import type { Subscription } from "./subscription.js";
import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class Subscriber extends Base {
  declare subscriptions: AssociationProxy<Subscription>;
  declare books: AssociationProxy<Book>;
  declare books_count: number;
  declare name: string;
  declare nick: string;
  declare update_count: number;

  static {
    this.primaryKey = "nick";
  }

  static {
    this.hasMany("subscriptions");
    this.hasMany("books", { through: "subscriptions" });
  }
}
registerModel(Subscriber);

export class SpecialSubscriber extends Subscriber {}
registerModel(SpecialSubscriber);
