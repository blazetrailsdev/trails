import { Base, registerModel } from "@blazetrails/activerecord";
export class Book extends Base {
  static {
    this.tableName = "books";
    registerModel(this);
  }
}
export class Review extends Base {
  static {
    this.tableName = "reviews";
    registerModel(this);
  }
}
