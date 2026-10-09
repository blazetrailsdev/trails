export class Post extends Base {
  static {
    this.scope("published", function (this: any) {
      return this.where({ published: true });
    });
    this.scope("recent", function (this: any, limit: number) {
      return this.order("created_at").limit(limit);
    });
  }
}
