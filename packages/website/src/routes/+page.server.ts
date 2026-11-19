import { codeToHtml } from "shiki";

import { loadParity, percent, shortSha } from "$lib/parity";

const blocks = [
  {
    file: "app/models/article.ts",
    lang: "ts",
    title: "Active Records make modeling easy.",
    body: "Databases come to life with business logic encapsulated in rich objects. Modeling associations between tables, providing callbacks when saved, encrypting sensitive data seamlessly, and expressing SQL queries beautifully.",
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
    title: "Action Controllers handle all requests.",
    body: "Controllers expose the domain model to the web, process incoming parameters, set caching headers, and render templates, responding with either HTML or JSON.",
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
    title: "Action Views mix TypeScript and HTML.",
    body: "Templates can use the full versatility of TypeScript, excessive code is extracted into helpers, and the domain model is used directly and interwoven with the HTML.",
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
    title: "Action Dispatch routes URLs.",
    body: "Configure how URLs connect to the controllers using the routing domain language. Routes expose the bundle of actions that go together as a resource: index, show, new, create, edit, update, destroy.",
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

export async function load() {
  const parity = await loadParity();
  return {
    measuredAt: shortSha(parity.measuredAt),
    coverage: Object.fromEntries(parity.packages.map((p) => [p.name, percent(p.api)])),
    hero: {
      rails: await codeToHtml(railsPost, { lang: "ruby", theme: "github-dark" }),
      trails: await codeToHtml(trailsPost, { lang: "ts", theme: "github-dark" }),
      check: await codeToHtml(check, {
        lang: "ts",
        theme: "github-dark",
        decorations: [
          {
            start: { line: 5, character: 10 },
            end: { line: 5, character: 11 },
            properties: { class: "squiggle" },
          },
        ],
        transformers: [
          {
            line(node, line) {
              if (line === 6) {
                node.children.push({
                  type: "element",
                  tagName: "span",
                  properties: { class: "tip" },
                  children: [{ type: "text", value: checkError }],
                });
              }
            },
          },
        ],
      }),
    },
    blocks: await Promise.all(
      blocks.map(async ({ code, lang, ...rest }) => ({
        ...rest,
        html: await codeToHtml(code, { lang, theme: "github-dark" }),
      })),
    ),
  };
}
