export class Post extends Base {
  declare author: Author | null;
  declare loadBelongsTo: (name: "author") => Promise<Author | null>;

  static {
    this.belongsTo("author");
  }
}
