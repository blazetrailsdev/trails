export class Post extends Base {
  declare title: string | null;

  static {
    this.attribute("title", "string");
    this.attribute("body", "string");
  }
}
