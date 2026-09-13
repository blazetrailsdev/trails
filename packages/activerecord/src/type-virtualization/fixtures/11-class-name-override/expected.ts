export class Post extends Base {
  declare writer: Author | null;
  declare remarks: import("@blazetrails/activerecord").AssociationProxy<Comment>;

  static {
    this.belongsTo("writer", { className: "Author" });
    this.hasMany("remarks", { className: "Comment" });
  }
}
