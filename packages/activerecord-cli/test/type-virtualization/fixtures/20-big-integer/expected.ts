export class Counter extends Base {
  static {
    this.attribute("hits", "big_integer");
    this.attribute("user_id", "big_integer");
  }
}
export interface Counter {
  get hits(): bigint;
  set hits(value: bigint | number | string);
  hitsPreviouslyChanged(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  hitsChanged(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  hitsChange(): [bigint, bigint] | null;
  hitsWillChange(): unknown;
  hitsWas(): bigint;
  hitsPreviousChange(): [bigint, bigint] | null;
  hitsPreviouslyWas(): bigint;
  restoreHits(): void;
  clearHitsChange(): void;
  isSavedChangeToHits(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  savedChangeToHits(): [bigint, bigint] | null;
  hitsBeforeLastSave(): bigint;
  isWillSaveChangeToHits(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  hitsChangeToBeSaved(): [bigint, bigint] | null;
  hitsInDatabase(): bigint;
  get user_id(): import("@blazetrails/activerecord").PrimaryKeyValue;
  set user_id(value: import("@blazetrails/activerecord").PrimaryKeyValue);
  user_idPreviouslyChanged(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  user_idChanged(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  user_idChange(): [import("@blazetrails/activerecord").PrimaryKeyValue, import("@blazetrails/activerecord").PrimaryKeyValue] | null;
  user_idWillChange(): unknown;
  user_idWas(): import("@blazetrails/activerecord").PrimaryKeyValue;
  user_idPreviousChange(): [import("@blazetrails/activerecord").PrimaryKeyValue, import("@blazetrails/activerecord").PrimaryKeyValue] | null;
  user_idPreviouslyWas(): import("@blazetrails/activerecord").PrimaryKeyValue;
  restoreUser_id(): void;
  clearUser_idChange(): void;
  isSavedChangeToUser_id(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  savedChangeToUser_id(): [import("@blazetrails/activerecord").PrimaryKeyValue, import("@blazetrails/activerecord").PrimaryKeyValue] | null;
  user_idBeforeLastSave(): import("@blazetrails/activerecord").PrimaryKeyValue;
  isWillSaveChangeToUser_id(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  user_idChangeToBeSaved(): [import("@blazetrails/activerecord").PrimaryKeyValue, import("@blazetrails/activerecord").PrimaryKeyValue] | null;
  user_idInDatabase(): import("@blazetrails/activerecord").PrimaryKeyValue;
}

