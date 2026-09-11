import { defineEnum } from "@blazetrails/activerecord/enum";

export class Conversation extends Base {
  static {
    this.attribute("status", "integer");
  }
}

defineEnum(Conversation, "status", ["active", "archived"]);
