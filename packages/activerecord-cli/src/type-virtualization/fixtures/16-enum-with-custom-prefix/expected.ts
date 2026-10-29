export class Task extends Base {
  declare isTierLow: () => boolean;
  declare tierLowBang: () => Promise<true | undefined>;
  declare static tierLow: () => import("@blazetrails/activerecord").Relation<Task>;
  declare static notTierLow: () => import("@blazetrails/activerecord").Relation<Task>;
  declare isTierHigh: () => boolean;
  declare tierHighBang: () => Promise<true | undefined>;
  declare static tierHigh: () => import("@blazetrails/activerecord").Relation<Task>;
  declare static notTierHigh: () => import("@blazetrails/activerecord").Relation<Task>;

  static {
    this.attribute("status", "integer");
    this.enum("status", { low: 0, high: 1 }, { prefix: "tier" });
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
    tierLow(this: import("@blazetrails/activerecord").Relation<Task>): import("@blazetrails/activerecord").Relation<Task>;
    notTierLow(this: import("@blazetrails/activerecord").Relation<Task>): import("@blazetrails/activerecord").Relation<Task>;
    tierHigh(this: import("@blazetrails/activerecord").Relation<Task>): import("@blazetrails/activerecord").Relation<Task>;
    notTierHigh(this: import("@blazetrails/activerecord").Relation<Task>): import("@blazetrails/activerecord").Relation<Task>;
  }
}
