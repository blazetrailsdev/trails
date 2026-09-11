import { defineEnum } from "@blazetrails/activerecord/enum";

export class Article extends Base {
  static {
    this.attribute("status", "integer");
    defineEnum(this, "status", { draft: 0, published: 1 });
  }
}
