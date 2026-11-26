import type { CollectionProxy } from "@blazetrails/activerecord";
import { ApplicationRecord } from "./application-record.ts";
import type { Book } from "./book.ts";

export class Author extends ApplicationRecord {
  declare name: string;
  declare born: number | null;
  declare books: CollectionProxy<Book>;

  static {
    this.hasMany("books", { dependent: "destroy" });
    this.validates("name", { presence: true, uniqueness: true });
    this.validates("born", { numericality: { onlyInteger: true }, allowNil: true });
  }
}
