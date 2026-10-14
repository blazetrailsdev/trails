export class Post extends Base {
  static {
    this.hasAndBelongsToMany("tags");
  }
}
