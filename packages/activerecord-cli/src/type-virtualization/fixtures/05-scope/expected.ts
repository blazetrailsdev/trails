export class Post extends Base {
  declare static published: () => import("@blazetrails/activerecord").Relation<Post>;
  declare static recent: (limit: number) => import("@blazetrails/activerecord").Relation<Post>;

  static {
    this.scope("published", function (this: any) {
      return this.where({ published: true });
    });
    this.scope("recent", function (this: any, limit: number) {
      return this.order("created_at").limit(limit);
    });
  }
}
declare module "@blazetrails/activerecord" {
  interface RelationScopes<T extends import("@blazetrails/activerecord").Base> {
    published(this: import("@blazetrails/activerecord").Relation<Post>): import("@blazetrails/activerecord").Relation<Post>;
    recent(this: import("@blazetrails/activerecord").Relation<Post>, limit: number): import("@blazetrails/activerecord").Relation<Post>;
  }
}
