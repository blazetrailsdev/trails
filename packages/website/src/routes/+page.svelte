<script>
  import { base } from "$app/paths";

  const repo = "https://github.com/blazetrailsdev/trails";
  const guides = `${base}/docs/guides/`;

  const navLeft = [
    { label: "Source", href: repo },
    { label: "Docs", href: `${base}/docs/` },
    { label: "API", href: `${base}/docs/api/@blazetrails/arel/README` },
  ];
  const navRight = [
    { label: "Guides", href: guides },
    { label: "Parity", href: `${repo}/blob/main/docs/parity-gates.md` },
  ];

  const tiles = [
    "activerecord", "activemodel", "actionpack", "actionview",
    "actionmailer", "actionmailbox", "actiontext", "activejob",
    "activestorage", "actioncable", "activesupport", "arel",
    "rack", "trailties", "solid-queue", "solid-cache",
    "solid-cable", "turbo", "stimulus", "vite-trails",
    "i18n", "thor",
  ];

  const blocks = [
    {
      file: "app/models/article.ts",
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
    return \`Written by \${author.name} on \${this.createdAt.toFormattedS("short")}\`;
  }

  async deliverLater(): Promise<void> {
    await Article.DeliveryJob.performLater(this);
  }
}`,
    },
    {
      file: "app/controllers/articles-controller.ts",
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

  const cards = [
    { tag: "Learning", title: "Read the guides", body: "Learn what the frameworks can do and how they fit together.", href: guides },
    { tag: "Source", title: "Browse on GitHub", body: "Read the code and the Rails source it mirrors.", href: repo },
    { tag: "Keeping up", title: "See what’s new", body: "The latest releases and updates on development.", href: `${repo}/commits/main` },
  ];
</script>

<svelte:head>
  <title>trails</title>
</svelte:head>

<div class="page">
  <div class="announce"><a href={repo}>trails is open source on GitHub &rarr;</a></div>

  <nav class="nav">
    <ul class="left">{#each navLeft as l}<li><a href={l.href}>{l.label}</a></li>{/each}</ul>
    <a href="{base}/" class="mark" aria-label="trails home">
      <svg viewBox="0 0 220 56" aria-hidden="true">
        <defs>
          <linearGradient id="blaze" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stop-color="#c2410c" />
            <stop offset="1" stop-color="#f59e0b" />
          </linearGradient>
        </defs>
        <text x="110" y="42" text-anchor="middle" font-size="44" font-weight="900" letter-spacing="-1.5">
          <tspan fill="url(#blaze)">Blaze</tspan><tspan fill="#2f5d1e">Trails</tspan>
        </text>
      </svg>
    </a>
    <ul class="right">{#each navRight as l}<li><a href={l.href}>{l.label}</a></li>{/each}</ul>
  </nav>

  <header class="hero">
    <h1>Accelerate your agents with convention over configuration.</h1>
    <p class="lede"><strong>trails scales from PROMPT to IPO.</strong> Token-efficient code that's easy for agents to write and beautiful for humans to review.</p>
    <span class="pill">trails &mdash; pre-release</span>
    <div class="video">Editor video placeholder</div>
  </header>

  <section class="company">
    <h2>You’re in good company.</h2>
    <p class="intro">trails ports the Rails frameworks to TypeScript, one package per framework.</p>
    <ul class="tiles">{#each tiles as t}<li><a href="{repo}/tree/main/packages/{t}">{t}</a></li>{/each}</ul>
    <p class="small"><strong>These are just a few of the packages.</strong> The gems Rails depends on are ported alongside them.</p>
  </section>

  <section class="band">
    <div class="card">
      <h2>Everything you need.</h2>
      <p class="intro"><strong>trails is a full-stack framework.</strong> It ships with all the tools needed to build amazing web apps on both the front and back end with strong conventions that keep your agents from producing a huge, unmaintainable mess.</p>
      <p class="small">Rendering HTML templates, updating databases, sending and receiving emails, maintaining live pages via WebSockets, enqueuing jobs for asynchronous work, storing uploads in the cloud, providing solid security protections for common attacks. trails does it all and so much more.</p>
    </div>
  </section>

  <section class="band blocks">
    {#each blocks as b}
      <div class="block">
        <div class="code">
          <div class="file">{b.file} &middot; placeholder</div>
          <pre><code>{b.code}</code></pre>
        </div>
        <h3>{b.title}</h3>
        <p>{b.body}</p>
      </div>
    {/each}
  </section>

  <section class="band">
    <div class="card">
      <h2>Optimized for happiness.</h2>
      <p class="small">trails has united and cultivated a strong tribe around a wide set of heretical thoughts about the nature of programming and programmers. Understanding these thoughts will help you understand the design of the framework.</p>
      <a class="cta" href="{base}/docs/guides/idioms">Read the trails idioms &rsaquo;</a>
    </div>
  </section>

  <section class="start">
    <h2>Let’s get started.</h2>
    <div class="cards">
      {#each cards as c}
        <a class="start-card" href={c.href}>
          <span class="tag">{c.tag}</span>
          <strong>{c.title}</strong>
          <span>{c.body}</span>
        </a>
      {/each}
    </div>
    <p class="small">Stay up to date with trails on <a href={repo}>GitHub</a>.</p>
  </section>

  <footer class="foot">
    <ul>
      <li><a href={repo}>Source</a></li>
      <li><a href="{repo}/blob/main/LICENSES.md">License</a></li>
      <li><a href="{repo}/security">Security</a></li>
    </ul>
    <p>trails is an independent TypeScript re-implementation of Ruby on Rails. Rails is a trademark of David Heinemeier Hansson; trails is not affiliated with or endorsed by the Rails project.</p>
  </footer>
</div>

<style>
  .page {
    --red: #d30001;
    --ink: #261b23;
    --tint: #f0e7e9;
    --sans: "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif;
    --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    background: #fff;
    color: var(--ink);
    font: 21px/1.45 var(--sans);
    text-align: center;
  }
  a { color: inherit; }
  h1, h2 { color: var(--red); font-weight: 700; letter-spacing: -0.02em; margin: 0 auto 1.5rem; }
  h1 { font-size: 78px; line-height: 72px; max-width: 1000px; }
  h2 { font-size: 56px; line-height: 1; }
  h3 { color: var(--red); font-size: 28px; margin: 1.5rem 0 0.5rem; }
  .intro { font-size: 26px; line-height: 1.3; max-width: 780px; margin: 0 auto 1.5rem; }
  .small { font-size: 17px; max-width: 760px; margin: 1.5rem auto 0; }
  .cta { font-weight: 700; text-decoration: underline; text-underline-offset: 4px; font-size: 19px; }

  .announce { background: var(--ink); color: #fff; font-size: 15px; font-weight: 600; padding: 8px; }
  .announce a { text-decoration: none; }

  .nav { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 40px; padding: 20px 40px; }
  .nav ul { display: flex; gap: 36px; list-style: none; margin: 0; padding: 0; font-size: 16px; font-weight: 600; }
  .nav a { text-decoration: none; }
  .left { justify-content: flex-end; }
  .mark svg { display: block; width: 180px; }

  .hero { padding: 40px 24px 80px; }
  .lede { font-size: 30px; line-height: 1.3; max-width: 700px; margin: 0 auto 1.5rem; }
  .lede strong { display: block; }
  .pill { display: inline-block; background: var(--tint); border-radius: 6px; padding: 6px 14px; font-size: 15px; font-weight: 600; margin-bottom: 56px; }
  .video { max-width: 1170px; aspect-ratio: 16 / 9; margin: 0 auto; background: #1d1720; border-radius: 10px; color: #8a7f86; display: grid; place-items: center; font-size: 18px; box-shadow: 0 30px 60px rgb(0 0 0 / 0.2); }

  .company { padding: 40px 24px 100px; }
  .tiles { display: grid; grid-template-columns: repeat(4, 220px); justify-content: center; gap: 18px; list-style: none; padding: 0; margin: 48px 0; }
  .tiles a { display: grid; place-items: center; height: 84px; background: var(--tint); border-radius: 8px; font-weight: 700; font-size: 20px; text-decoration: none; }
  .tiles li:nth-last-child(2) { grid-column: 2; }

  .band { background: var(--tint); padding: 90px 24px; }
  .card { background: #fff; max-width: 1170px; margin: 90px auto 0; padding: 60px 80px; border-radius: 10px; box-shadow: 0 10px 40px rgb(0 0 0 / 0.08); }
  .band > .card:first-child { margin-top: 0; }

  .blocks { padding-top: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 560px)); justify-content: center; gap: 60px 50px; }
  .code { background: #3a3038; border-radius: 6px; overflow: hidden; text-align: left; }
  .file { background: #2c242a; color: #cfc5cb; font: 13px var(--mono); text-align: center; padding: 8px; }
  .code pre { margin: 0; padding: 20px; min-height: 340px; font: 13px/1.6 var(--mono); color: #e8dfe4; overflow-x: auto; }
  .block p { font-size: 17px; margin: 0 auto; max-width: 500px; }

  .start { padding: 90px 24px; }
  .cards { display: grid; grid-template-columns: repeat(3, 340px); justify-content: center; gap: 30px; margin-top: 40px; }
  .start-card { position: relative; display: flex; flex-direction: column; gap: 8px; padding: 40px 24px 28px; border-radius: 8px; box-shadow: 0 6px 24px rgb(0 0 0 / 0.1); text-decoration: none; font-size: 15px; }
  .start-card strong { font-size: 19px; text-decoration: underline; text-underline-offset: 3px; }
  .tag { position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: var(--red); color: #fff; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 3px 10px; border-radius: 3px; }

  .foot { background: var(--tint); padding: 60px 24px; font-size: 14px; }
  .foot ul { display: flex; justify-content: center; gap: 28px; list-style: none; margin: 0 0 12px; padding: 0; }
  .foot p { margin: 0; color: #6b5d66; }

  @media (max-width: 900px) {
    h1 { font-size: 44px; line-height: 1.05; }
    h2 { font-size: 38px; }
    .nav { grid-template-columns: 1fr; gap: 12px; }
    .mark { order: -1; justify-self: center; }
    .nav ul { justify-content: center; flex-wrap: wrap; gap: 16px; }
    .tiles { grid-template-columns: repeat(2, 1fr); }
    .tiles li:nth-last-child(2) { grid-column: auto; }
    .blocks, .cards { grid-template-columns: 1fr; }
    .card { padding: 40px 24px; }
  }
</style>
