export class Article extends Base {
  declare isDraftStatus: () => boolean;
  declare draftStatusBang: () => Promise<true | undefined>;
  declare static draftStatus: () => import("@blazetrails/activerecord").Relation<Article>;
  declare static notDraftStatus: () => import("@blazetrails/activerecord").Relation<Article>;
  declare isPublishedStatus: () => boolean;
  declare publishedStatusBang: () => Promise<true | undefined>;
  declare static publishedStatus: () => import("@blazetrails/activerecord").Relation<Article>;
  declare static notPublishedStatus: () => import("@blazetrails/activerecord").Relation<Article>;

  static {
    this.attribute("status", "integer");
  }
}
export interface Article {
  get status(): "draft" | "published";
  set status(value: "draft" | "published" | 0 | 1);
  statusPreviouslyChanged(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  statusChanged(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  statusChange(): ["draft" | "published", "draft" | "published"] | null;
  statusWillChange(): unknown;
  statusWas(): "draft" | "published";
  statusPreviousChange(): ["draft" | "published", "draft" | "published"] | null;
  statusPreviouslyWas(): "draft" | "published";
  restoreStatus(): void;
  clearStatusChange(): void;
  isSavedChangeToStatus(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  savedChangeToStatus(): ["draft" | "published", "draft" | "published"] | null;
  statusBeforeLastSave(): "draft" | "published";
  isWillSaveChangeToStatus(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  statusChangeToBeSaved(): ["draft" | "published", "draft" | "published"] | null;
  statusInDatabase(): "draft" | "published";
}


Article.enum("status", { draft: 0, published: 1 }, { suffix: true });
declare module "@blazetrails/activerecord" {
  interface RelationScopes<T extends import("@blazetrails/activerecord").Base> {
    draftStatus(this: import("@blazetrails/activerecord").Relation<Article>): import("@blazetrails/activerecord").Relation<Article>;
    notDraftStatus(this: import("@blazetrails/activerecord").Relation<Article>): import("@blazetrails/activerecord").Relation<Article>;
    publishedStatus(this: import("@blazetrails/activerecord").Relation<Article>): import("@blazetrails/activerecord").Relation<Article>;
    notPublishedStatus(this: import("@blazetrails/activerecord").Relation<Article>): import("@blazetrails/activerecord").Relation<Article>;
  }
}
