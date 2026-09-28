import { Base } from "@blazetrails/activerecord";

export class Post extends Base {
  static {
    this.attribute("title", "string");
    this.attribute("status", "integer");
    this.scope("published", function (this: any) {
      return this.where({ published: true });
    });
    this.scope("titled", function (this: any, title: string) {
      return this.where({ title });
    });
    this.enum("status", { draft: 0, archived: 1 }, { prefix: true });
  }
}
