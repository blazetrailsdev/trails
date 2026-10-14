export class Comment extends Base {
  static {
    this.belongsTo("commentable", { polymorphic: true });
  }
}
