export class Task extends Base {
  declare isStatusLow: () => boolean;
  declare statusLowBang: () => Promise<true | undefined>;
  declare static statusLow: () => import("@blazetrails/activerecord").Relation<Task>;
  declare static notStatusLow: () => import("@blazetrails/activerecord").Relation<Task>;
  declare isStatusHigh: () => boolean;
  declare statusHighBang: () => Promise<true | undefined>;
  declare static statusHigh: () => import("@blazetrails/activerecord").Relation<Task>;
  declare static notStatusHigh: () => import("@blazetrails/activerecord").Relation<Task>;

  static {
    this.attribute("status", "integer");
    this.enum("status", { low: 0, high: 1 }, { prefix: true });
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
    statusLow(this: import("@blazetrails/activerecord").Relation<Task>): import("@blazetrails/activerecord").Relation<Task>;
    notStatusLow(this: import("@blazetrails/activerecord").Relation<Task>): import("@blazetrails/activerecord").Relation<Task>;
    statusHigh(this: import("@blazetrails/activerecord").Relation<Task>): import("@blazetrails/activerecord").Relation<Task>;
    notStatusHigh(this: import("@blazetrails/activerecord").Relation<Task>): import("@blazetrails/activerecord").Relation<Task>;
  }
}
