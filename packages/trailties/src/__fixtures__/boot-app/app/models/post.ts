import { Base } from "@blazetrails/activerecord";

export class Post extends Base {
  static {
    this.belongsTo("author");
    this.enum("status", { draft: 0, published: 1 });
  }

  headline(): string {
    return this.isPublished() ? this.title : `${this.title} (draft)`;
  }

  async byline(): Promise<string | undefined> {
    return (await this.author)?.name;
  }
}
