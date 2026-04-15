import { defineEnum } from "@blazetrails/activerecord";

export class Article extends Base {
  declare status: number;
  declare isDraft: () => boolean;
  declare draft: () => void;
  declare draftBang: () => Promise<void>;
  declare static draft: () => Relation<Article>;
  declare static notDraft: () => Relation<Article>;
  declare isPublished: () => boolean;
  declare published: () => void;
  declare publishedBang: () => Promise<void>;
  declare static published: () => Relation<Article>;
  declare static notPublished: () => Relation<Article>;

  static {
    this.attribute("status", "integer");
  }
}

defineEnum(Article, "status", { draft: 0, published: 1 });
