import { Base, registerModel } from "@blazetrails/activerecord";

export class Book extends Base {
  static {
    this.tableName = "books";
    registerModel(this);
  }
}

export class Author extends Base {
  static {
    this.tableName = "authors";
    registerModel(this);
  }
}
