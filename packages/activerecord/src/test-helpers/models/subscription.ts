import type { Book } from "./book.js";
import type { Subscriber } from "./subscriber.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Subscription extends Base {
  declare book_id: number;
  declare subscriber_id: string;

  static automaticallyInvertPluralAssociations = true;

  static {
    this.belongsTo("subscriber", { counterCache: "books_count" });
    this.belongsTo("book", function (this: ReturnType<(typeof Base)["all"]>) {
      return this.where({ author_visibility: 0 });
    });
    this.validatesPresenceOf("subscriber_id", "book_id");
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Subscription {
  get subscriber(): Subscriber | null | Promise<Subscriber | null>;
  set subscriber(value: Subscriber | null);
  get book(): Book | null | Promise<Book | null>;
  set book(value: Book | null);
}
