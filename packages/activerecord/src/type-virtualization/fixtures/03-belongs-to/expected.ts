export class Post extends Base {
  declare author: Author | null | Promise<Author | null>;

  static {
    this.belongsTo("author");
  }
}
