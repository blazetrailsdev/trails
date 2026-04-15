import { defineEnum } from "@blazetrails/activerecord";

export class Conversation extends Base {
  declare status: number;
  declare isActive: () => boolean;
  declare active: () => void;
  declare activeBang: () => Promise<void>;
  declare static active: () => import("@blazetrails/activerecord").Relation<Conversation>;
  declare static notActive: () => import("@blazetrails/activerecord").Relation<Conversation>;
  declare isArchived: () => boolean;
  declare archived: () => void;
  declare archivedBang: () => Promise<void>;
  declare static archived: () => import("@blazetrails/activerecord").Relation<Conversation>;
  declare static notArchived: () => import("@blazetrails/activerecord").Relation<Conversation>;

  static {
    this.attribute("status", "integer");
  }
}

defineEnum(Conversation, "status", ["active", "archived"]);
