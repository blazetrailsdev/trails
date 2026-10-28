export class Task extends Base {
  declare isLow: () => boolean;
  declare lowBang: () => Promise<true | undefined>;
  declare static low: () => import("@blazetrails/activerecord").Relation<Task>;
  declare static notLow: () => import("@blazetrails/activerecord").Relation<Task>;
  declare isHigh: () => boolean;
  declare highBang: () => Promise<true | undefined>;
  declare static high: () => import("@blazetrails/activerecord").Relation<Task>;
  declare static notHigh: () => import("@blazetrails/activerecord").Relation<Task>;

  static {
    this.attribute("status", "integer");
    this.enum("status", { low: 0, high: 1 });
  }
}
export interface Task {
  get status(): "low" | "high";
  set status(value: "low" | "high" | 0 | 1);
  statusPreviouslyChanged(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  statusChanged(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  statusChange(): ["low" | "high", "low" | "high"] | null;
  statusWillChange(): unknown;
  statusWas(): "low" | "high";
  statusPreviousChange(): ["low" | "high", "low" | "high"] | null;
  statusPreviouslyWas(): "low" | "high";
  restoreStatus(): void;
  clearStatusChange(): void;
  isSavedChangeToStatus(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  savedChangeToStatus(): ["low" | "high", "low" | "high"] | null;
  statusBeforeLastSave(): "low" | "high";
  isWillSaveChangeToStatus(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  statusChangeToBeSaved(): ["low" | "high", "low" | "high"] | null;
  statusInDatabase(): "low" | "high";
}

declare module "@blazetrails/activerecord" {
  interface RelationScopes<T extends import("@blazetrails/activerecord").Base> {
    low(this: import("@blazetrails/activerecord").Relation<Task>): import("@blazetrails/activerecord").Relation<Task>;
    notLow(this: import("@blazetrails/activerecord").Relation<Task>): import("@blazetrails/activerecord").Relation<Task>;
    high(this: import("@blazetrails/activerecord").Relation<Task>): import("@blazetrails/activerecord").Relation<Task>;
    notHigh(this: import("@blazetrails/activerecord").Relation<Task>): import("@blazetrails/activerecord").Relation<Task>;
  }
}
