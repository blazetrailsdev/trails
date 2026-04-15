export class Post extends Base {
  declare static published: () => Relation<Post>;
  declare static recent: (limit: number) => Relation<Post>;

  static {
    this.scope("published", (rel) => rel.where({ published: true }));
    this.scope("recent", (rel, limit: number) => rel.order("created_at").limit(limit));
  }
}
