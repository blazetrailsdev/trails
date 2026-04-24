import { Base } from "@blazetrails/activerecord";

export class Book extends Base {
  static {
    this.tableName = "books";
  }
}
