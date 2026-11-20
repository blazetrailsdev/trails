import { codeToHtml } from "shiki";

import { loadParity, percent, shortSha } from "$lib/parity";

const blocks = [
  {
    file: "app/models/article.ts",
    lang: "ts",
    title: "Models are typed classes.",
    body: "A model class maps a table to typed attributes. Declare associations, validations, callbacks and encrypted columns the way Rails does, and build queries by chaining scopes that compile to SQL.",
    code: `import { ApplicationRecord } from "./application-record.js";
import { Current } from "./current.js";

export class Article extends ApplicationRecord {
  static {
    this.belongsTo("author", { default: () => Current.user });
    this.hasMany("comments");

    this.hasOneAttached("coverImage");
    this.hasRichText("content", { encrypted: true });
    this.enum("status", ["drafted", "published"]);

    this.scope("recent", function () {
      return this.order({ created_at: "desc" }).limit(25);
    });

    this.afterSaveCommit("deliverLater", { if: "isPublished" });
  }

  async byline(): Promise<string> {
    const author = await this.author;
    return \`Written by \${author.name} on \${this.createdAt.toFs("short")}\`;
  }

  async deliverLater(): Promise<void> {
    await Article.DeliveryJob.performLater(this);
  }
}`,
  },
  {
    file: "app/controllers/articles-controller.ts",
    lang: "ts",
    title: "Controllers turn requests into responses.",
    body: "An action reads params, loads records, and renders a view or JSON. Filters, strong parameters and HTTP caching come with it, under the names Rails uses.",
    code: `import { Article } from "../models/article.js";
import { ApplicationController } from "./application-controller.js";

export class ArticlesController extends ApplicationController {
  declare articles: Article[];
  declare article: Article;

  async index(): Promise<void> {
    this.articles = await Article.recent();
  }

  async show(): Promise<void> {
    this.article = await Article.find(this.params.expect("id"));
    await this.freshWhen({ etag: this.article });
  }

  async create(): Promise<void> {
    const article = await Article.createBang(this._articleParams());
    await this.redirectTo(article);
  }

  private _articleParams() {
    return this.params.expect({ article: ["title", "content"] });
  }
}`,
  },
  {
    file: "app/views/articles/show.html.tse",
    lang: "erb",
    title: "Views are typed templates.",
    body: "TSE templates embed TypeScript in HTML, and the compiler checks every expression against the controller that renders them. Shared markup goes in partials, shared logic in helpers.",
    code: `<h1><%= this.article.title %></h1>

<%= imageTag(this.article.coverImage.url()) %>

<p><%= this.article.content %></p>

<% if (Current.user.isAdmin()) { %>
  <%= linkTo("Edit", editArticlePath(this.article)) %>
<% } %>`,
  },
  {
    file: "config/routes.ts",
    lang: "ts",
    title: "Routes map URLs to actions.",
    body: "Draw routes with the familiar DSL. One resources line gives a model its seven RESTful actions, with path helpers to link to each of them.",
    code: `import { Trails } from "@blazetrails/trailties";

Trails.application.routes().draw(function () {
  this.resources("articles", function () { // /articles, /articles/1
    this.resources("comments");             // /articles/1/comments, /comments/1
  });

  this.root("articles#index");              // /
});`,
  },
];

const railsPost = `class Post < ApplicationRecord
  belongs_to :author, optional: true
  has_many :comments, dependent: :destroy

  validates :title, presence: true

  scope :published, -> { where(published: true) }
end`;

const trailsPost = `export class Post extends ApplicationRecord {
  static {
    this.belongsTo("author", { optional: true });
    this.hasMany("comments", { dependent: "destroy" });

    this.validates("title", { presence: true });

    this.scope("published", function () {
      return this.where({ published: true });
    });
  }
}`;

const check = `import { Post } from "./post.ts";

export class Check {
  static async run(): Promise<void> {
    const post = await Post.find(1);
    const n: number = post.title;
  }
}`;

const checkError =
  "app/models/check.ts(6,11): error TS2322: Type 'string | null' is not assignable to type 'number'.";

const view = `<article>
  <h1><%= this.post.title %></h1>
  <p><%= this.post.titel %></p>
</article>`;

const viewError =
  "app/views/posts/show.html.tse(3,20): error TS2551: Property 'titel' does not exist on type 'Post'.";

function withError(
  code: string,
  lang: string,
  line: number,
  from: number,
  to: number,
  message: string,
) {
  return codeToHtml(code, {
    lang,
    theme: "github-dark",
    decorations: [
      {
        start: { line: line - 1, character: from },
        end: { line: line - 1, character: to },
        properties: { class: "squiggle" },
      },
    ],
    transformers: [
      {
        line(node, n) {
          if (n === line) {
            node.children.push({
              type: "element",
              tagName: "span",
              properties: { class: "tip" },
              children: [{ type: "text", value: message }],
            });
          }
        },
      },
    ],
  });
}

export async function load() {
  const parity = await loadParity();
  return {
    measuredAt: shortSha(parity.measuredAt),
    coverage: Object.fromEntries(parity.packages.map((p) => [p.name, percent(p.api)])),
    hero: {
      rails: await codeToHtml(railsPost, { lang: "ruby", theme: "github-dark" }),
      trails: await codeToHtml(trailsPost, { lang: "ts", theme: "github-dark" }),
      check: await withError(check, "ts", 6, 10, 11, checkError),
      view: await withError(view, "erb", 3, 19, 24, viewError),
    },
    blocks: await Promise.all(
      blocks.map(async ({ code, lang, ...rest }) => ({
        ...rest,
        html: await codeToHtml(code, { lang, theme: "github-dark" }),
      })),
    ),
  };
}
