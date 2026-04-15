export class Post extends Base {
  declare tags: Tag[];

  static {
    this.hasAndBelongsToMany("tags");
  }
}
