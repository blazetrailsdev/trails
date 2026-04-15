export class Post extends Base {
  static {
    this.scope("published", (rel) => rel.where({ published: true }));
    this.scope("recent", (rel, limit: number) => rel.order("created_at").limit(limit));
  }
}
