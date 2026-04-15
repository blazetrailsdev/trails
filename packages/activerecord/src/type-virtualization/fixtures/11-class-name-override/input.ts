export class Post extends Base {
  static {
    this.belongsTo("writer", { className: "Author" });
    this.hasMany("remarks", { className: "Comment" });
  }
}
