export class Comment extends Base {
  declare commentable: Base | null;

  static {
    this.belongsTo("commentable", { polymorphic: true });
  }
}
