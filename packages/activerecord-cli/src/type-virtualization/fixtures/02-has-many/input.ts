export class Blog extends Base {
  static {
    this.hasMany("posts");
    this.hasMany("comments");
  }
}
