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
  get status(): "active" | "archived";
  set status(value: "active" | "archived" | 0 | 1);
  statusPreviouslyChanged(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  statusChanged(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  statusChange(): ["active" | "archived", "active" | "archived"] | null;
  statusWillChange(): unknown;
  statusWas(): "active" | "archived";
  statusPreviousChange(): ["active" | "archived", "active" | "archived"] | null;
  statusPreviouslyWas(): "active" | "archived";
  restoreStatus(): void;
  clearStatusChange(): void;
  isSavedChangeToStatus(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  savedChangeToStatus(): ["active" | "archived", "active" | "archived"] | null;
  statusBeforeLastSave(): "active" | "archived";
  isWillSaveChangeToStatus(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  statusChangeToBeSaved(): ["active" | "archived", "active" | "archived"] | null;
  statusInDatabase(): "active" | "archived";
}


Conversation.enum("status", ["active", "archived"]);
declare module "@blazetrails/activerecord" {
  interface RelationScopes<T extends import("@blazetrails/activerecord").Base> {
    active(this: import("@blazetrails/activerecord").Relation<Conversation>): import("@blazetrails/activerecord").Relation<Conversation>;
    notActive(this: import("@blazetrails/activerecord").Relation<Conversation>): import("@blazetrails/activerecord").Relation<Conversation>;
    archived(this: import("@blazetrails/activerecord").Relation<Conversation>): import("@blazetrails/activerecord").Relation<Conversation>;
    notArchived(this: import("@blazetrails/activerecord").Relation<Conversation>): import("@blazetrails/activerecord").Relation<Conversation>;
  }
}
