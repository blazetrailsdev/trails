export class Post extends Base {
  declare comments: import("@blazetrails/activerecord").AssociationProxy<Comment>;
  declare static published: () => import("@blazetrails/activerecord").Relation<Post>;

  static {
    this.attribute("title", "string");
    this.attribute("published", "boolean");
    this.belongsTo("author");
    this.hasMany("comments");
    this.scope("published", function (this: any) {
      return this.where({ published: true });
    });
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
  get author(): Author | null | Promise<Author | null>;
  set author(value: Author | null);
}

declare module "@blazetrails/activerecord" {
  interface RelationScopes<T extends import("@blazetrails/activerecord").Base> {
    published(this: import("@blazetrails/activerecord").Relation<Post>): import("@blazetrails/activerecord").Relation<Post>;
  }
}
