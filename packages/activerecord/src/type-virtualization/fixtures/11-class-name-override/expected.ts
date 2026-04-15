export class Post extends Base {
  declare writer: Author | null;
  declare remarks: import("@blazetrails/activerecord").AssociationProxy<Comment>;
  declare loadBelongsTo: (name: "writer") => Promise<Author | null>;

  static {
    this.belongsTo("writer", { className: "Author" });
    this.hasMany("remarks", { className: "Comment" });
  }
}
