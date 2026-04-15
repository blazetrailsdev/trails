import { defineEnum } from "@blazetrails/activerecord";

export class Article extends Base {
  declare status: number;
  declare isDraftStatus: () => boolean;
  declare draftStatus: () => void;
  declare draftStatusBang: () => Promise<void>;
  declare static draftStatus: () => Relation<Article>;
  declare static notDraftStatus: () => Relation<Article>;
  declare isPublishedStatus: () => boolean;
  declare publishedStatus: () => void;
  declare publishedStatusBang: () => Promise<void>;
  declare static publishedStatus: () => Relation<Article>;
  declare static notPublishedStatus: () => Relation<Article>;

  static {
    this.attribute("status", "integer");
  }
}

defineEnum(Article, "status", { draft: 0, published: 1 }, { suffix: true });
