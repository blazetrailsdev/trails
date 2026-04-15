export class Blog extends Base {
  declare posts: Post[];
  declare comments: Comment[];

  static {
    this.hasMany("posts");
    this.hasMany("comments");
  }
}
