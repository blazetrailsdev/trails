export class Article extends Base {
  static {
    this.attribute("status", "integer");
  }
}

Article.enum("status", { draft: 0, published: 1 });
