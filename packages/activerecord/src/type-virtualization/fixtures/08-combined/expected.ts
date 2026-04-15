export class Post extends Base {
  declare title: string;
  declare published: boolean;
  declare author: Author | null;
  declare comments: import("@blazetrails/activerecord").AssociationProxy<Comment>;
  declare static published: () => import("@blazetrails/activerecord").Relation<Post>;

  static {
    this.attribute("title", "string");
    this.attribute("published", "boolean");
    this.belongsTo("author");
    this.hasMany("comments");
    this.scope("published", (rel) => rel.where({ published: true }));
  }
}
