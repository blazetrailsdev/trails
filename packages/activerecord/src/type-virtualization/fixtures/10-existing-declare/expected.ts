export class Post extends Base {
  declare title: string | null;

  static {
    this.attribute("title", "string");
    this.attribute("body", "string");
  }
}
export interface Post {
  get body(): string;
  set body(value: unknown);
}

