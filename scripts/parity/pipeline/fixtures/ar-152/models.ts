import { Base, Relation, registerModel } from "@blazetrails/activerecord";

export class Author extends Base {
  static {
    this.tableName = "authors";
    this.hasMany("books");
    this.hasMany("publishedBooks", (rel: Relation<any>) => rel.where({ status: "published" }), {
      className: "Book",
    });
    registerModel(this);
  }
}

export class Book extends Base {
  static {
    this.tableName = "books";
    this.belongsTo("author");
    registerModel(this);
  }
}
