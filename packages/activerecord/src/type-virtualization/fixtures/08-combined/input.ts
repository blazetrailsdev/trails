export class Post extends Base {
  static {
    this.attribute("title", "string");
    this.attribute("published", "boolean");
    this.belongsTo("author");
    this.hasMany("comments");
    this.scope("published", (rel) => rel.where({ published: true }));
  }
}
