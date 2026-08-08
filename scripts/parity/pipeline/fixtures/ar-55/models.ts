import { Base, registerModel } from "@blazetrails/activerecord";

export class Author extends Base {
  static {
    this.tableName = "authors";
    this.hasMany("books");
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
