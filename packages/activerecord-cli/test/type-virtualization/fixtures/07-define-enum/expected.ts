export class Article extends Base {
  declare isDraft: () => boolean;
  declare draftBang: () => Promise<true | undefined>;
  declare static draft: () => import("@blazetrails/activerecord").Relation<Article>;
  declare static notDraft: () => import("@blazetrails/activerecord").Relation<Article>;
  declare isPublished: () => boolean;
  declare publishedBang: () => Promise<true | undefined>;
  declare static published: () => import("@blazetrails/activerecord").Relation<Article>;
  declare static notPublished: () => import("@blazetrails/activerecord").Relation<Article>;

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


Article.enum("status", { draft: 0, published: 1 });
declare module "@blazetrails/activerecord" {
  interface RelationScopes<T extends import("@blazetrails/activerecord").Base> {
    draft(this: import("@blazetrails/activerecord").Relation<Article>): import("@blazetrails/activerecord").Relation<Article>;
    notDraft(this: import("@blazetrails/activerecord").Relation<Article>): import("@blazetrails/activerecord").Relation<Article>;
    published(this: import("@blazetrails/activerecord").Relation<Article>): import("@blazetrails/activerecord").Relation<Article>;
    notPublished(this: import("@blazetrails/activerecord").Relation<Article>): import("@blazetrails/activerecord").Relation<Article>;
  }
}
