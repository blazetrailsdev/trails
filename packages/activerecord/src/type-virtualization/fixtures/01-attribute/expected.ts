export class Post extends Base {
  declare title: string;
  declare view_count: number;
  declare published: boolean;
  declare published_at: import("@blazetrails/activesupport/temporal").Temporal.Instant | import("@blazetrails/activesupport/temporal").Temporal.PlainDateTime;

  static {
    this.attribute("title", "string");
    this.attribute("view_count", "integer");
    this.attribute("published", "boolean");
    this.attribute("published_at", "datetime");
  }
}
