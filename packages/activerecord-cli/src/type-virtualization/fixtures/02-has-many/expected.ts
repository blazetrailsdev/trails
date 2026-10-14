export class Blog extends Base {
  declare posts: import("@blazetrails/activerecord").AssociationProxy<Post>;
  declare comments: import("@blazetrails/activerecord").AssociationProxy<Comment>;

  static {
    this.hasMany("posts");
    this.hasMany("comments");
  }
}
