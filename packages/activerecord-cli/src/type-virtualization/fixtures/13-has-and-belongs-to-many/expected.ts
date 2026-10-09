export class Post extends Base {
  declare tags: import("@blazetrails/activerecord").AssociationProxy<Tag>;

  static {
    this.hasAndBelongsToMany("tags");
  }
}
