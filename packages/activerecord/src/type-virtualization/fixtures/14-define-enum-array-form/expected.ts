import { defineEnum } from "@blazetrails/activerecord";

export class Conversation extends Base {
  declare status: number;
  declare isActive: () => boolean;
  declare active: () => void;
  declare activeBang: () => Promise<void>;
  declare static active: () => Relation<Conversation>;
  declare static notActive: () => Relation<Conversation>;
  declare isArchived: () => boolean;
  declare archived: () => void;
  declare archivedBang: () => Promise<void>;
  declare static archived: () => Relation<Conversation>;
  declare static notArchived: () => Relation<Conversation>;

  static {
    this.attribute("status", "integer");
  }
}

defineEnum(Conversation, "status", ["active", "archived"]);
