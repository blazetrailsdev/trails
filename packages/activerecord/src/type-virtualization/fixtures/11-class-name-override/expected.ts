export class Post extends Base {
  declare remarks: import("@blazetrails/activerecord").AssociationProxy<Comment>;

  static {
    this.belongsTo("writer", { className: "Author" });
    this.hasMany("remarks", { className: "Comment" });
  }
}
export interface Post {
  get writer(): Author | null | Promise<Author | null>;
  set writer(value: Author | null);
}

