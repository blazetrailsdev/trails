export class Comment extends Base {
  static {
    this.belongsTo("commentable", { polymorphic: true });
  }
}
export interface Comment {
  get commentable(): Base | null | Promise<Base | null>;
  set commentable(value: Base | null);
}

