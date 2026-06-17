import type { Author } from "./author.js";
import type { Category } from "./category.js";
import type { Owner } from "./owner.js";
// vendor/rails/activerecord/test/models/essay.rb
import { Base } from "../../base.js";

export class Essay extends Base {
  declare author: Author | null;
  declare writer: Base | null;
  declare category: Category | null;
  declare owner: Owner | null;
  declare loadBelongsTo: ((name: "author") => Promise<Author | null>) &
    ((name: "writer") => Promise<Base | null>) &
    ((name: "category") => Promise<Category | null>);
  declare loadHasOne: (name: "owner") => Promise<Owner | null>;
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

export class EssaySpecial extends Essay {}

export class TypedEssay extends Essay {}
