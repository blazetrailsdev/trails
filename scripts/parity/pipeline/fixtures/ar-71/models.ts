import { Base } from "@blazetrails/activerecord";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";

export class Author extends Base {
  static {
    this.tableName = "authors";
    this.hasMany("books");
    constSet(TopLevel, this.name, this);
  }
}
export class Review extends Base {
  static {
    this.tableName = "reviews";
    this.belongsTo("book");
    constSet(TopLevel, this.name, this);
  }
}
export class Book extends Base {
  static {
    this.tableName = "books";
    this.belongsTo("author");
    this.hasMany("reviews");
    constSet(TopLevel, this.name, this);
  }
}
