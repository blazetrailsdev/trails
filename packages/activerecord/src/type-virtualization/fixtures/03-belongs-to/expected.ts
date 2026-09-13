export class Post extends Base {
  static {
    this.belongsTo("author");
  }
}
export interface Post {
  get author(): Author | null | Promise<Author | null>;
  set author(value: Author | null);
}

