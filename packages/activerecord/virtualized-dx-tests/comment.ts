import { Base } from "@blazetrails/activerecord";

export class Comment extends Base {
  static {
    this.attribute("body", "string");
    this.attribute("post_id", "integer");
  }
}
