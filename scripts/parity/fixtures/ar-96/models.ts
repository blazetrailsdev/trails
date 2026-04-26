import { Base, registerModel } from "@blazetrails/activerecord";

export class Review extends Base {
  static {
    this.tableName = "reviews";
    this.belongsTo("book");
    registerModel(this);
  }
}

export class Book extends Base {
  static {
    this.tableName = "books";
    this.hasMany("reviews");
    registerModel(this);
  }
}
