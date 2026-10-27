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
  set title(value: unknown);
  get view_count(): number;
  set view_count(value: unknown);
  get published(): boolean;
  set published(value: unknown);
  get published_at(): import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/ruby-compat").Time;
  set published_at(value: unknown);
}

