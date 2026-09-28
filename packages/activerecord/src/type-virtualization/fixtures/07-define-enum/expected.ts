export class Article extends Base {
  declare isDraft: () => boolean;
  declare draftBang: () => Promise<true | undefined>;
  declare static draft: () => import("@blazetrails/activerecord").Relation<Article>;
  declare static notDraft: () => import("@blazetrails/activerecord").Relation<Article>;
  declare isPublished: () => boolean;
  declare publishedBang: () => Promise<true | undefined>;
  declare static published: () => import("@blazetrails/activerecord").Relation<Article>;
  declare static notPublished: () => import("@blazetrails/activerecord").Relation<Article>;

  static {
    this.attribute("status", "integer");
  }
}
export interface Article {
  get status(): "draft" | "published";
  set status(value: unknown);
}


Article.enum("status", { draft: 0, published: 1 });
declare module "@blazetrails/activerecord" {
  interface RelationScopes<T extends import("@blazetrails/activerecord").Base> {
    draft(this: import("@blazetrails/activerecord").Relation<Article>): import("@blazetrails/activerecord").Relation<Article>;
    notDraft(this: import("@blazetrails/activerecord").Relation<Article>): import("@blazetrails/activerecord").Relation<Article>;
    published(this: import("@blazetrails/activerecord").Relation<Article>): import("@blazetrails/activerecord").Relation<Article>;
    notPublished(this: import("@blazetrails/activerecord").Relation<Article>): import("@blazetrails/activerecord").Relation<Article>;
  }
}
