export class Post extends Base {
  declare title: string;
  declare view_count: number;
  declare published: boolean;
  declare published_at: Date;

  static {
    this.attribute("title", "string");
    this.attribute("view_count", "integer");
    this.attribute("published", "boolean");
    this.attribute("published_at", "datetime");
  }
}
