import { defineEnum } from "@blazetrails/activerecord";

export class Article extends Base {
  declare status: number;
  declare isDraft: () => boolean;
  declare draftBang: () => Promise<true>;
  declare static draft: () => import("@blazetrails/activerecord").Relation<Article>;
  declare static notDraft: () => import("@blazetrails/activerecord").Relation<Article>;
  declare isPublished: () => boolean;
  declare publishedBang: () => Promise<true>;
  declare static published: () => import("@blazetrails/activerecord").Relation<Article>;
  declare static notPublished: () => import("@blazetrails/activerecord").Relation<Article>;

  static {
    this.attribute("status", "integer");
  }
}

defineEnum(Article, "status", { draft: 0, published: 1 });
