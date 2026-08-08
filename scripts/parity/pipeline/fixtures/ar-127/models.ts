import { Base, registerModel } from "@blazetrails/activerecord";

export class Book extends Base {
  static {
    this.tableName = "books";
    this.belongsTo("author");
    this.hasMany("reviews");
    registerModel(this);
  }
}

export class Author extends Base {
  static {
    this.tableName = "authors";
    this.hasMany("books");
    registerModel(this);
  }
}

export class Review extends Base {
  static {
    this.tableName = "reviews";
    this.belongsTo("book");
    registerModel(this);
  }
}
