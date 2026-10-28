export class Post extends Base {
  static {
    this.attribute("title", "string");
    this.attribute("view_count", "integer");
    this.attribute("published", "boolean");
    this.attribute("published_at", "datetime");
  }
}
export interface Post {
  get title(): string;
  set title(value: string | number | boolean);
  titlePreviouslyChanged(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  titleChanged(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  titleChange(): [string, string] | null;
  titleWillChange(): unknown;
  titleWas(): string;
  titlePreviousChange(): [string, string] | null;
  titlePreviouslyWas(): string;
  restoreTitle(): void;
  clearTitleChange(): void;
  isSavedChangeToTitle(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  savedChangeToTitle(): [string, string] | null;
  titleBeforeLastSave(): string;
  isWillSaveChangeToTitle(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  titleChangeToBeSaved(): [string, string] | null;
  titleInDatabase(): string;
  get view_count(): number;
  set view_count(value: number | string);
  view_countPreviouslyChanged(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  view_countChanged(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  view_countChange(): [number, number] | null;
  view_countWillChange(): unknown;
  view_countWas(): number;
  view_countPreviousChange(): [number, number] | null;
  view_countPreviouslyWas(): number;
  restoreView_count(): void;
  clearView_countChange(): void;
  isSavedChangeToView_count(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  savedChangeToView_count(): [number, number] | null;
  view_countBeforeLastSave(): number;
  isWillSaveChangeToView_count(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  view_countChangeToBeSaved(): [number, number] | null;
  view_countInDatabase(): number;
  get published(): boolean;
  set published(value: boolean | string | number);
  publishedPreviouslyChanged(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  publishedChanged(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  publishedChange(): [boolean, boolean] | null;
  publishedWillChange(): unknown;
  publishedWas(): boolean;
  publishedPreviousChange(): [boolean, boolean] | null;
  publishedPreviouslyWas(): boolean;
  restorePublished(): void;
  clearPublishedChange(): void;
  isSavedChangeToPublished(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  savedChangeToPublished(): [boolean, boolean] | null;
  publishedBeforeLastSave(): boolean;
  isWillSaveChangeToPublished(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  publishedChangeToBeSaved(): [boolean, boolean] | null;
  publishedInDatabase(): boolean;
  get published_at(): import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time;
  set published_at(value: import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time | string);
  published_atPreviouslyChanged(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  published_atChanged(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  published_atChange(): [import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time, import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time] | null;
  published_atWillChange(): unknown;
  published_atWas(): import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time;
  published_atPreviousChange(): [import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time, import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time] | null;
  published_atPreviouslyWas(): import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time;
  restorePublished_at(): void;
  clearPublished_atChange(): void;
  isSavedChangeToPublished_at(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  savedChangeToPublished_at(): [import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time, import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time] | null;
  published_atBeforeLastSave(): import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time;
  isWillSaveChangeToPublished_at(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  published_atChangeToBeSaved(): [import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time, import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time] | null;
  published_atInDatabase(): import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time;
}

