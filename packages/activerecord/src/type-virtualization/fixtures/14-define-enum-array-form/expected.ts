import { defineEnum } from "@blazetrails/activerecord";

export class Conversation extends Base {
  declare isActive: () => boolean;
  declare activeBang: () => Promise<true | undefined>;
  declare static active: () => import("@blazetrails/activerecord").Relation<Conversation>;
  declare static notActive: () => import("@blazetrails/activerecord").Relation<Conversation>;
  declare isArchived: () => boolean;
  declare archivedBang: () => Promise<true | undefined>;
  declare static archived: () => import("@blazetrails/activerecord").Relation<Conversation>;
  declare static notArchived: () => import("@blazetrails/activerecord").Relation<Conversation>;

  static {
    this.attribute("status", "integer");
  }
}
export interface Conversation {
  get status(): number;
  set status(value: unknown);
}


defineEnum(Conversation, "status", ["active", "archived"]);
