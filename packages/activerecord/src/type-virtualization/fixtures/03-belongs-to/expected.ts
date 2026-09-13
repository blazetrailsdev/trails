export class Post extends Base {
  declare author: Author | null;

  static {
    this.belongsTo("author");
  }
}
