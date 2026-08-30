import { defineEnum } from "@blazetrails/activerecord";

export class Article extends Base {
  declare isDraftStatus: () => boolean;
  declare draftStatusBang: () => Promise<true | undefined>;
  declare static draftStatus: () => import("@blazetrails/activerecord").Relation<Article>;
  declare static notDraftStatus: () => import("@blazetrails/activerecord").Relation<Article>;
  declare isPublishedStatus: () => boolean;
  declare publishedStatusBang: () => Promise<true | undefined>;
  declare static publishedStatus: () => import("@blazetrails/activerecord").Relation<Article>;
  declare static notPublishedStatus: () => import("@blazetrails/activerecord").Relation<Article>;

  static {
    this.attribute("status", "integer");
  }
}
export interface Article {
  get status(): number;
  set status(value: unknown);
}


defineEnum(Article, "status", { draft: 0, published: 1 }, { suffix: true });
