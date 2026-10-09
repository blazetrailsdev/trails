export class Post extends Base {
  static {
    this.belongsTo("author");
  }
}
