import { Base } from "@blazetrails/activerecord";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";

export class Author extends Base {
  static {
    this.tableName = "authors";
    this.hasMany("books");
    this.hasMany(
      "publishedBooks",
      function (this: any) {
        return this.where({ status: "published" });
      },
      {
        className: "Book",
      },
    );
    constSet(TopLevel, this.name, this);
  }
}

export class Book extends Base {
  static {
    this.tableName = "books";
    this.belongsTo("author");
    constSet(TopLevel, this.name, this);
  }
}
