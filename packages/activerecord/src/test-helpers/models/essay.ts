import type { Author } from "./author.js";
import type { Category } from "./category.js";
import type { Owner } from "./owner.js";
import { Base } from "../../base.js";

export class Essay extends Base {
  declare author_id: string;
  declare book_id: number;
  declare category_id: string;
  declare name: string;
  declare "type": string;
  declare writer_id: string;
  declare writer_type: string;

  static {
    this.belongsTo("author", { primaryKey: "name" });
    this.belongsTo("writer", { primaryKey: "name", polymorphic: true });
    this.belongsTo("category", { primaryKey: "name" });
    this.hasOne("owner", { primaryKey: "name" });
  }
}
export interface Essay {
  get author(): Author | null | Promise<Author | null>;
  set author(value: Author | null);
  get writer(): Base | null | Promise<Base | null>;
  set writer(value: Base | null);
  get category(): Category | null | Promise<Category | null>;
  set category(value: Category | null);
  get owner(): Owner | null | Promise<Owner | null>;
  set owner(value: Owner | null);
}

export class EssaySpecial extends Essay {}

export class TypedEssay extends Essay {}
