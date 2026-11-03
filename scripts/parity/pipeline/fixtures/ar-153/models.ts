import { Base } from "@blazetrails/activerecord";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
export class Author extends Base {
  static {
    this.tableName = "authors";
    constSet(TopLevel, this.name, this);
  }
}
export class Book extends Base {
  static {
    this.tableName = "books";
    constSet(TopLevel, this.name, this);
  }
}
