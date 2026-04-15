export class Post extends Base {
  declare title: string;
  declare published: boolean;
  declare author: Author | null;
  declare comments: Comment[];
  declare static published: () => Relation<Post>;

  static {
    this.attribute("title", "string");
    this.attribute("published", "boolean");
    this.belongsTo("author");
    this.hasMany("comments");
    this.scope("published", (rel) => rel.where({ published: true }));
  }
}
