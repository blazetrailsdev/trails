import { ApplicationRecord } from "./application-record.ts";
import type { Author } from "./author.ts";

export class Book extends ApplicationRecord {
  declare title: string;
  declare isbn: string;
  declare published_year: number;
  declare author: Author;

  static {
    this.belongsTo("author", { counterCache: true });
    this.validates("title", { presence: true });
    this.validates("isbn", { uniqueness: true, format: { with: /^\d{13}$/ } });
    this.validates("published_year", { numericality: { greaterThan: 1400 } });
  }
}
