import { isPresent } from "@blazetrails/activesupport";
import { RuntimeError, TopLevel } from "@blazetrails/ruby-compat";
import { Article } from "../models/article.js";
import { ApplicationController } from "./application-controller.js";

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    ArticlesController?: typeof ArticlesController;
  }
}

type UrlHelpers = { articlesUrl(): string };

export class ArticlesController extends ApplicationController {
  declare articles: unknown;
  declare article: Article;

  static {
    this.beforeAction(":assertParamMethodBang", { only: ["update", "destroy"] });
  }

  index(): void {
    this.articles = Article.all();
  }

  async edit(): Promise<void> {
    this.article = await Article.find(this.params.get("id"));
  }

  async update(): Promise<void> {
    this.article = await Article.find(this.params.get("id"));

    await this.article.updateBang(this.articleParams());

    await this.redirectTo((this as unknown as UrlHelpers).articlesUrl());
  }

  async create(): Promise<void> {
    this.article = new Article();

    await this.article.updateBang(this.articleParams());

    await this.redirectTo((this as unknown as UrlHelpers).articlesUrl());
  }

  async destroy(): Promise<void> {
    this.article = await Article.find(this.params.get("id"));

    await this.article.destroyBang();

    await this.redirectTo((this as unknown as UrlHelpers).articlesUrl());
  }

  async destroyAll(): Promise<void> {
    await Article.destroyAll();
    await this.redirectTo((this as unknown as UrlHelpers).articlesUrl(), { status: ":see_other" });
  }

  /** @internal */
  private articleParams() {
    return (this.params.require("article") as typeof this.params).permit("body");
  }

  /** @internal */
  private assertParamMethodBang(): void {
    if (!isPresent(this.params.get("_method"))) throw new RuntimeError("unhandled exception");
  }
}
TopLevel.ArticlesController = ArticlesController;
