<script>
  import { base } from "$app/paths";

  const repo = "https://github.com/blazetrailsdev/trails";
  const docs = `${base}/docs/`;
  const gettingStarted = `${base}/docs/guides/`;
  const parity = `${repo}/blob/main/docs/parity-gates.md`;

  const navLeft = [
    { label: "Docs", href: docs },
    { label: "Guides", href: `${base}/docs/guides/` },
    { label: "API", href: `${base}/docs/api/` },
    { label: "Packages", href: "#packages" },
  ];
  const navRight = [
    { label: "Source", href: repo },
    { label: "Parity", href: parity },
    { label: "Changelog", href: `${repo}/commits/main` },
    { label: "GitHub", href: repo },
  ];

  const figures = [
    { value: "—", label: "contributors" },
    { value: "—", label: "packages published" },
    { value: "—", label: "Rails tests ported" },
  ];

  const placeholder = "// Placeholder: replaced by real walkthrough code\n// (website-landing-walkthrough-from-quickstart).\n// Not runnable.";

  const blocks = [
    {
      file: "app/models/article.ts",
      title: "Models carry the Active Record API.",
      body: "Associations, validations, callbacks, scopes and migrations keep their Rails names and their Rails behavior, checked method by method against the vendored source.",
    },
    {
      file: "app/controllers/articles-controller.ts",
      title: "Controllers answer requests the Rails way.",
      body: "Action Controller's filters, strong parameters, rendering and redirects, on a Rack stack ported alongside it.",
    },
    {
      file: "app/views/articles/show.html.tse",
      title: "Views render with Action View.",
      body: "Templates, partials, layouts and helpers. TSE is the TypeScript counterpart of ERB, compiled ahead of time.",
    },
    {
      file: "config/routes.ts",
      title: "Routes map URLs to actions.",
      body: "The routing DSL draws resources, nested routes and named helpers the way Action Dispatch does.",
    },
  ];

  const groups = [
    { name: "Models", pkgs: ["activerecord", "activemodel", "arel"] },
    {
      name: "Controllers & views",
      pkgs: ["actionpack", "actionview", "rack", "rack-cors", "rack-proxy", "rack-session", "rack-test", "rackup"],
    },
    {
      name: "Other components",
      pkgs: ["actionmailer", "actionmailbox", "actiontext", "activejob", "activestorage", "actioncable", "activesupport"],
    },
    {
      name: "Rails 8 defaults",
      pkgs: ["solid-queue", "solid-cache", "solid-cable", "turbo", "stimulus", "vite-assets", "vite-trails"],
    },
    {
      name: "Gems",
      pkgs: [
        "bcrypt", "builder", "chronic", "date", "did-you-mean", "et-orbi", "fugit", "globalid",
        "html-sanitizer", "i18n", "image-processing", "mail", "marcel", "mini-magick", "mini-mime",
        "msgpack", "net-smtp", "nokogiri", "pg", "raabro", "rake", "ruby-compat", "thor",
        "trailties", "tzinfo", "zeitwerk",
      ],
    },
    { name: "Tooling", pkgs: ["activerecord-cli", "trails-tsc", "tse-compiler", "vitest-matchers"] },
  ];

  const steps = [
    { n: 1, title: "Create an app", body: "Generate a new application with the trails command line." },
    { n: 2, title: "Add a model", body: "Generate a model and its migration, then migrate the database." },
    { n: 3, title: "Serve a controller", body: "Generate a controller, draw its routes and start the server." },
  ];
</script>

<svelte:head>
  <title>trails: Rails, ported to TypeScript</title>
</svelte:head>

<div class="page">
  <div class="announce">
    <a href={parity}>How every ported method is checked against the Rails source &rarr;</a>
  </div>

  <nav class="nav">
    <ul class="side left">
      {#each navLeft as l}<li><a href={l.href}>{l.label}</a></li>{/each}
    </ul>
    <a href="{base}/" class="mark" aria-label="trails home">
      <svg viewBox="0 0 220 56" role="img" aria-hidden="true">
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
    <ul class="side right">
      {#each navRight as l}<li><a href={l.href}>{l.label}</a></li>{/each}
    </ul>
  </nav>

  <header class="hero col">
    <h1>A Rails dev would recognize this as the same method.</h1>
    <p class="sub">trails is Ruby on Rails, ported to TypeScript.</p>
    <p class="lede">Every class, method and test name follows the Rails source it was ported from, so what you know about Rails carries over line for line.</p>
    <span class="pill">Pre-release &middot; parity: &mdash;</span>
    <div class="editor">
      <div class="bar"><span></span><span></span><span></span><em>app/controllers/articles-controller.ts</em></div>
      <pre><code>{placeholder}</code></pre>
    </div>
  </header>

  <section class="band">
    <div class="col">
      <h2>Built in the open.</h2>
      <p class="intro">Each figure is measured from the repository, never typed by hand.</p>
      <dl class="figures">
        {#each figures as f}
          <div><dt>{f.label}</dt><dd>{f.value}</dd></div>
        {/each}
      </dl>
    </div>
  </section>

  <section class="col narrow">
    <h2>Checked against the source.</h2>
    <p>The Rails source is vendored into the repository. Every ported method is compared with its Ruby counterpart: its name, its parameters and the calls it makes. Every test keeps the name of the Rails test it ports. Gates in CI fail any change that drifts further away.</p>
    <a class="cta" href="{repo}/blob/main/CONTRIBUTING.md">Read how to contribute &rsaquo;</a>
  </section>

  <section class="card-band">
    <div class="col card">
      <h2>Everything you need.</h2>
      <p class="sub">A full stack, one package per framework.</p>
      <p>Models, controllers, views, mailers, jobs, storage and sockets, with the Rails 8 defaults alongside them. Install the pieces you use.</p>
    </div>
  </section>

  <section class="blocks">
    {#each blocks as b, i}
      <div class="block" class:flip={i % 2 === 1}>
        <div class="editor">
          <div class="bar"><span></span><span></span><span></span><em>{b.file}</em></div>
          <pre><code>{placeholder}</code></pre>
        </div>
        <div class="text">
          <h3>{b.title}</h3>
          <p>{b.body}</p>
        </div>
      </div>
    {/each}
  </section>

  <section id="packages" class="packages">
    {#each groups as g}
      <div class="group">
        <h3>{g.name}</h3>
        <ul>
          {#each g.pkgs as p}<li><a href="{repo}/tree/main/packages/{p}">{p}</a></li>{/each}
        </ul>
      </div>
    {/each}
  </section>

  <section class="card-band">
    <div class="col card">
      <h2>Why a faithful port.</h2>
      <p>One mental model for two runtimes. A team that knows Rails can read a trails app on day one, and a fix found in either codebase points straight at its counterpart in the other.</p>
      <a class="cta" href="{base}/docs/guides/idioms">Read how Ruby idioms translate &rsaquo;</a>
    </div>
  </section>

  <section class="col">
    <h2>Get started.</h2>
    <div class="steps">
      {#each steps as s}
        <a class="step" href={gettingStarted}>
          <span class="n">Step {s.n}</span>
          <strong>{s.title}</strong>
          <span>{s.body}</span>
        </a>
      {/each}
    </div>
  </section>

  <footer class="foot">
    <ul>
      <li><a href={docs}>Docs</a></li>
      <li><a href="{base}/docs/guides/">Guides</a></li>
      <li><a href="{base}/docs/api/">API</a></li>
      <li><a href={repo}>GitHub</a></li>
    </ul>
    <p>Code under the MIT license. Documentation under CC BY 4.0.</p>
    <p>trails is an independent port of Ruby on Rails, which is created by David Heinemeier Hansson and the Rails core team. It is not affiliated with or endorsed by the Rails project.</p>
  </footer>
</div>

<style>
  .page {
    --accent: #2f5d1e;
    --ink: #1f1d1a;
    --muted: #5c564e;
    --ground: #fbfaf7;
    --tint: #f1eee7;
    --display: "Arial Black", "Helvetica Neue", Helvetica, system-ui, sans-serif;
    --body: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    background: var(--ground);
    color: var(--ink);
    font-family: var(--body);
    line-height: 1.55;
  }
  a { color: inherit; }
  h1, h2 { font-family: var(--display); font-weight: 900; color: var(--accent); letter-spacing: -0.02em; line-height: 1.08; margin: 0 0 1rem; }
  h1 { font-size: clamp(2.25rem, 5.5vw, 4rem); }
  h2 { font-size: clamp(1.9rem, 4vw, 3rem); text-align: center; }
  h3 { font-size: 1.25rem; margin: 0 0 0.5rem; color: var(--accent); }
  .col { max-width: 60rem; margin: 0 auto; padding: 4.5rem 1.5rem; text-align: center; }
  .narrow { max-width: 42rem; }
  .sub { font-weight: 700; font-size: 1.3rem; margin: 0 0 0.5rem; }
  .lede, .intro, .narrow p, .card p { font-size: 1.15rem; color: var(--muted); max-width: 38rem; margin: 0 auto 1.25rem; }
  .cta { font-weight: 700; text-decoration: underline; text-underline-offset: 4px; }

  .announce { background: var(--ink); color: var(--ground); text-align: center; font-size: 0.85rem; font-weight: 600; padding: 0.5rem 1rem; }
  .announce a { text-decoration: none; }

  .nav { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 2rem; padding: 1rem 2rem; }
  .side { display: flex; gap: 1.75rem; list-style: none; margin: 0; padding: 0; font-weight: 600; font-size: 0.95rem; }
  .side a { text-decoration: none; }
  .side a:hover { color: var(--accent); }
  .left { justify-content: flex-end; }
  .mark svg { display: block; width: 11rem; height: auto; }
  .mark text { font-family: var(--display); }

  .hero { padding-top: 2.5rem; }
  .pill { display: inline-block; background: var(--tint); border-radius: 999px; padding: 0.3rem 0.9rem; font-size: 0.85rem; font-weight: 600; margin-bottom: 2.5rem; }

  .editor { background: #23211e; border-radius: 0.6rem; overflow: hidden; text-align: left; box-shadow: 0 1rem 2.5rem rgb(0 0 0 / 0.15); }
  .bar { display: flex; align-items: center; gap: 0.4rem; padding: 0.55rem 0.9rem; background: #34302b; }
  .bar span { width: 0.65rem; height: 0.65rem; border-radius: 50%; background: #5c564e; }
  .bar em { margin-left: 0.6rem; font: 0.75rem var(--mono); font-style: normal; color: #b8b0a4; }
  .editor pre { margin: 0; padding: 1.25rem; min-height: 9rem; font: 0.85rem/1.6 var(--mono); color: #d8d2c8; overflow-x: auto; }
  .hero .editor pre { min-height: 18rem; }

  .band { background: var(--tint); }
  .figures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin: 2rem 0 0; }
  .figures div { background: var(--ground); border-radius: 0.5rem; padding: 1.5rem 1rem; }
  .figures dt { color: var(--muted); font-size: 0.9rem; }
  .figures dd { margin: 0; order: -1; font: 900 2.25rem var(--display); color: var(--accent); }
  .figures div { display: flex; flex-direction: column; }

  .card-band { background: var(--tint); padding: 3rem 1.5rem; }
  .card { background: var(--ground); border-radius: 0.5rem; padding: 3rem 2rem; box-shadow: 0 0.25rem 1rem rgb(0 0 0 / 0.06); }

  .blocks { max-width: 72rem; margin: 0 auto; padding: 4rem 1.5rem 1rem; display: grid; gap: 4rem; }
  .block { display: grid; grid-template-columns: 1.2fr 1fr; gap: 3rem; align-items: center; }
  .block.flip .editor { order: 2; }
  .text p { color: var(--muted); }

  .packages { max-width: 72rem; margin: 0 auto; padding: 2rem 1.5rem 5rem; display: grid; grid-template-columns: repeat(3, 1fr); gap: 2rem; }
  .group ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .group a { display: block; font: 0.8rem var(--mono); background: var(--tint); border-radius: 0.3rem; padding: 0.2rem 0.5rem; text-decoration: none; }
  .group a:hover { color: var(--accent); }

  .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.25rem; margin-top: 2rem; }
  .step { display: flex; flex-direction: column; gap: 0.4rem; text-decoration: none; border: 1px solid #ddd6ca; border-radius: 0.5rem; padding: 1.5rem; }
  .step:hover { border-color: var(--accent); }
  .step .n { align-self: center; background: var(--accent); color: var(--ground); font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; border-radius: 0.25rem; padding: 0.15rem 0.5rem; }
  .step strong { text-decoration: underline; text-underline-offset: 3px; }
  .step span:last-child { color: var(--muted); font-size: 0.9rem; }

  .foot { background: var(--tint); text-align: center; padding: 3rem 1.5rem; font-size: 0.85rem; color: var(--muted); }
  .foot ul { display: flex; justify-content: center; gap: 1.5rem; list-style: none; padding: 0; margin: 0 0 1rem; font-weight: 600; color: var(--ink); }
  .foot p { margin: 0.3rem auto; max-width: 40rem; }

  @media (max-width: 860px) {
    .nav { grid-template-columns: 1fr; gap: 0.75rem; }
    .mark { order: -1; justify-self: center; }
    .side { justify-content: center; flex-wrap: wrap; gap: 1rem; }
    .block, .packages, .steps, .figures { grid-template-columns: 1fr; }
    .block.flip .editor { order: 0; }
  }
</style>
