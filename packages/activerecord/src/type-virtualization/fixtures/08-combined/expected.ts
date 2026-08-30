export class Post extends Base {
  declare author: Author | null;
  declare comments: import("@blazetrails/activerecord").AssociationProxy<Comment>;
  declare static published: () => import("@blazetrails/activerecord").Relation<Post>;
  declare loadBelongsTo: (name: "author") => Promise<Author | null>;

  static {
    this.attribute("title", "string");
    this.attribute("published", "boolean");
    this.belongsTo("author");
    this.hasMany("comments");
    this.scope("published", function (this: any) {
      return this.where({ published: true });
    });
  }
}
export interface Post {
  get title(): string;
  set title(value: unknown);
  get published(): boolean;
  set published(value: unknown);
}

