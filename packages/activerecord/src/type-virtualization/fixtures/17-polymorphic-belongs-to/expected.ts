export class Comment extends Base {
  declare commentable: Base | null;
  declare loadBelongsTo: (name: "commentable") => Promise<Base | null>;

  static {
    this.belongsTo("commentable", { polymorphic: true });
  }
}
