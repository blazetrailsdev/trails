import { Base } from "@blazetrails/activerecord";

export class Author extends Base {
  static {
    this.hasMany("posts");
  }
}
