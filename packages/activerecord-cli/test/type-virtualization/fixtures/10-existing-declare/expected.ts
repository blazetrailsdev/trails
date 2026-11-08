export class Post extends Base {
  declare title: string | null;

  static {
    this.attribute("title", "string");
    this.attribute("body", "string");
  }
}
export interface Post {
  get body(): string;
  set body(value: string | number | boolean);
  bodyPreviouslyChanged(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  bodyChanged(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  bodyChange(): [string, string] | null;
  bodyWillChange(): unknown;
  bodyWas(): string;
  bodyPreviousChange(): [string, string] | null;
  bodyPreviouslyWas(): string;
  restoreBody(): void;
  clearBodyChange(): void;
  isSavedChangeToBody(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  savedChangeToBody(): [string, string] | null;
  bodyBeforeLastSave(): string;
  isWillSaveChangeToBody(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  bodyChangeToBeSaved(): [string, string] | null;
  bodyInDatabase(): string;
}

