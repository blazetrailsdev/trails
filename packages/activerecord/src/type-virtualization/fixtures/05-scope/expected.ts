export class Post extends Base {
  declare static published: () => import("@blazetrails/activerecord").Relation<Post>;
  declare static recent: (limit: number) => import("@blazetrails/activerecord").Relation<Post>;

  static {
    this.scope("published", (rel) => rel.where({ published: true }));
    this.scope("recent", (rel, limit: number) => rel.order("created_at").limit(limit));
  }
}
