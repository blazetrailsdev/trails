<script>
  import "@fontsource-variable/bricolage-grotesque";
  import "@fontsource-variable/instrument-sans";
  import "@fontsource-variable/jetbrains-mono";
  import { base } from "$app/paths";
  import { LANDING_TILES as tiles } from "$lib/landing-tiles";

  let { data } = $props();
  let tab = $state("caught");

  const installs = {
    npm: "npm install -g @blazetrails/trails && trails new blog",
    pnpm: "pnpm add -g @blazetrails/trails && trails new blog",
    yarn: "yarn global add @blazetrails/trails && trails new blog",
    bun: "bun add -g @blazetrails/trails && trails new blog",
  };
  let pm = $state("npm");
  let copied = $state(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(installs[pm]);
      copied = true;
    } catch {
      copied = false;
    }
  }

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

  const railsGems = new Set([
    "activerecord", "activemodel", "actionpack", "actionview",
    "actionmailer", "actionmailbox", "actiontext", "activejob",
    "activestorage", "actioncable", "activesupport", "arel", "trailties",
    "solid-queue", "solid-cache", "solid-cable", "thor",
  ]);


  const cards = [
    { tag: "Learning", title: "Read the guides", body: "Walk through each framework, from models to mailers to WebSockets.", href: guides },
    { tag: "Source", title: "Browse on GitHub", body: "Read the code and the Rails source it mirrors.", href: repo },
  ];
</script>

<svelte:head>
  <title>BlazeTrails</title>
</svelte:head>

<div class="page">
  <div class="announce"><a href={repo}>trails is open source on GitHub &rarr;</a></div>

  <nav class="nav">
    <ul class="left">{#each navLeft as l}<li><a href={l.href}>{l.label}</a></li>{/each}</ul>
    <a href="{base}/" class="mark" title="BlazeTrails home">
      <span class="wm" aria-hidden="true"><span class="blaze">blaze</span><span class="trails">trails</span></span>
      <span class="sr-only">blazetrails</span>
    </a>
    <ul class="right">{#each navRight as l}<li><a href={l.href}>{l.label}</a></li>{/each}</ul>
  </nav>

  <header class="hero">
    <h1>Convention over configuration.<br />Now with types.</h1>
    <p class="lede">trails is Rails in TypeScript: the same names and conventions, plus a compiler that catches what your agents get wrong.</p>
    <span class="pill">trails &mdash; pre-release &middot; measured at {data.measuredAt}</span>
    <div class="stage">
      <div class="tabs" role="tablist" aria-label="Examples">
        <button role="tab" aria-selected={tab === "caught"} onclick={() => (tab = "caught")}>Caught by the compiler</button>
        <button role="tab" aria-selected={tab === "ai"} onclick={() => (tab = "ai")}>AI disclaimer</button>
      </div>
      {#if tab === "caught"}
        <div class="pane" role="tabpanel">
          <div class="split">
            <div>
              <div class="file">app/controllers/posts-controller.ts &middot; tsc --noEmit</div>
              {@html data.hero.check}
            </div>
            <div>
              <div class="file">app/views/posts/show.html.tse &middot; trails-tsc-views build &amp;&amp; tsc</div>
              {@html data.hero.view}
            </div>
          </div>
          <p class="note">Typos in a controller and in a template, both caught before the app runs. Each error is the compiler's real output for a scratch edit of the <a href="{repo}/tree/{data.buildRef}/examples/homepage">home page example</a>.</p>
        </div>
      {:else}
        <div class="pane ai" role="tabpanel">
          <img class="meme" src="{base}/push-rails-over-there.jpg" width="500" height="880" alt="Put It Somewhere Else Patrick meme. Top panel: What if we took Rails. Bottom panel: and pushed it over there." />
          <p class="disclaimer"><strong>AI was used to build trails.</strong> Most of its code, tests and docs were written by Claude, working from the vendored Rails source under human direction and review, with code reviews from Copilot and Codex.</p>
        </div>
      {/if}
    </div>
  </header>

  <section class="company">
    <h2>All the familiar gems, dressed in TypeScript.</h2>
    <p class="intro">trails ports the Rails frameworks to TypeScript, one package per framework.</p>
    <ul class="tiles">{#each tiles as t}<li><a href="{base}/docs/packages/{t}"><span>{t}</span>{#if data.coverage[t] && data.coverage[t] !== "—"}<small>{data.coverage[t]} of the {railsGems.has(t) ? "Rails" : "Ruby gem"} API</small>{/if}</a></li>{/each}</ul>
    <p class="small"><strong>And more.</strong> We&rsquo;re bringing all the friends along.</p>
    <p class="fine">Each percentage is the share of the upstream gem's public API names (classes, modules, methods and constants) that have a matching name in the trails package. &ldquo;Rails API&rdquo; marks a gem the Rails project owns, such as Active Record, Solid Queue or thor; &ldquo;Ruby gem API&rdquo; marks one of the other gems Rails depends on, such as rack or i18n. &ldquo;Measured at {data.measuredAt}&rdquo; names the trails commit the figures were computed on. A trails app's client-side JavaScript, Turbo and Stimulus included, uses these same packages, so the code in the browser and on the server is all compatible.</p>
  </section>

  <section class="band">
    <div class="card">
      <h2>One framework, the whole stack.</h2>
      <p class="intro"><strong>trails is a full-stack framework.</strong> Models, views, controllers, jobs, mail and real-time updates all come in the box, and shared conventions give your agents one obvious place for every piece of code.</p>
      <p class="small">Query and migrate your database, render typed templates, send and receive email, push live updates over WebSockets, run background jobs, and store file uploads locally or in the cloud, all from one set of packages.</p>
    </div>
  </section>

  <section class="band blocks">
    {#each data.blocks as b}
      <div class="block">
        <div class="code">
          <a class="file" href={b.href}>examples/homepage/{b.file}</a>
          {@html b.html}
        </div>
        <h3>{b.title}</h3>
        <p>{#each b.body as part, i}{#if i % 2}<code>{part}</code>{:else}{part}{/if}{/each}</p>
      </div>
    {/each}
  </section>

  <section class="band">
    <div class="card">
      <h2>Built for Rails developers, new and seasoned.</h2>
      <p class="small"><strong>Bring the Rails you know, or learn it as you go, and let agents write the types.</strong> Use the Rails vocabulary to write apps at the speed of agents. Deploy serverless to <a href="{repo}/tree/{data.buildRef}/examples/serverless-lambda">Lambda</a> or <a href="{repo}/tree/{data.buildRef}/examples/cloudflare-worker">Cloudflare</a>. Use Active Record in a <a href="{repo}/tree/{data.buildRef}/examples/react-native-notes">React Native app</a>. On the roadmap: the full stack running in the browser.</p>
      <p class="small"><strong>trails and Rails apps can work side by side.</strong> In live demos, a trails app and a Rails app read each other's encrypted passwords and exchange Active Job messages across the two languages in real time.</p>
    </div>
  </section>

  <section class="start">
    <h2>Start a trails app.</h2>
    <div class="cards">
      {#each cards as c}
        <a class="start-card" href={c.href}>
          <span class="tag">{c.tag}</span>
          <strong>{c.title}</strong>
          <span>{c.body}</span>
        </a>
      {/each}
    </div>
    <div class="install">
      <div class="pms">
        {#each Object.keys(installs) as k}
          <button aria-pressed={pm === k} onclick={() => ((pm = k), (copied = false))}>{k}</button>
        {/each}
      </div>
      <div class="cmd">
        <code><span class="prompt">$</span> {installs[pm]}</code>
        <button class="copy" onclick={copy}>{copied ? "Copied" : "Copy"}</button>
      </div>
    </div>
    <p class="small">Building interactive pages? trails ports <a href="{base}/docs/packages/turbo">Turbo</a> and <a href="{base}/docs/packages/stimulus">Stimulus</a>, so your app can update its pages over the wire with server-rendered HTML and little custom JavaScript.</p>
  </section>

  <footer class="foot">
    <ul>
      <li><a href={repo}>Source</a></li>
      <li><a href="{repo}/blob/main/LICENSES.md">License</a></li>
    </ul>
    <p>trails is an independent TypeScript re-implementation of Ruby on Rails. The Rails trademarks are exclusively licensed to the Rails Foundation. Uses of ‘Rails’ and ‘Ruby on Rails’ in this website are for identification purposes only and do not imply an endorsement by or affiliation with Rails, the trademark owner, or the Rails Foundation.</p>
  </footer>
</div>

<style>
  .page {
    --orange: #e8590c;
    --mango: #f2b01e;
    --ink: #2b1d14;
    --tint: #fdf1d6;
    --display: "Bricolage Grotesque Variable", "Helvetica Neue", Arial, sans-serif;
    --sans: "Instrument Sans Variable", "Helvetica Neue", Arial, system-ui, sans-serif;
    --mono: "JetBrains Mono Variable", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    background: #fff;
    color: var(--ink);
    font: 21px/1.45 var(--sans);
    text-align: center;
  }
  a { color: inherit; text-decoration: underline; text-underline-offset: 3px; }
  .page :global(:not(pre, .cmd) > code) { font: 0.9em var(--mono); background: var(--tint); border: 1px solid #ecd9b0; border-radius: 4px; padding: 0.05em 0.35em; }
  h1, h2, h3 { font-family: var(--display); }
  h1, h2 { color: var(--orange); font-weight: 800; letter-spacing: -0.035em; margin: 0 auto 1.5rem; }
  h1 { font-size: 78px; line-height: 72px; max-width: 1200px; }
  h2 { font-size: 78px; line-height: 72px; }
  h3 { color: var(--orange); font-size: 36px; line-height: 34px; margin: 1.5rem 0 0.75rem; }
  .intro { font-size: 39px; line-height: 44px; max-width: 960px; margin: 0 auto 1.5rem; }
  .small { font-size: 26px; line-height: 29px; max-width: 900px; margin: 1.5rem auto 0; }

  .announce { background: var(--ink); color: #fff; font-size: 15px; font-weight: 600; padding: 8px; }

  .nav { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 40px; padding: 20px 40px; }
  .nav ul { display: flex; gap: 36px; list-style: none; margin: 0; padding: 0; font-size: 16px; font-weight: 600; }
  .left { justify-content: flex-end; }
  .mark { text-decoration: none; }
  .wm { font: 800 44px/1 var(--display); letter-spacing: -0.045em; color: var(--ink); }
  .blaze { color: var(--orange); }
  .trails { position: relative; display: inline-block; padding-bottom: 0.16em; }
  .trails::after { content: ""; position: absolute; left: 0.02em; right: 0.06em; bottom: 0; height: 0.12em; background: linear-gradient(var(--mango), var(--mango)) top / 100% 0.03em no-repeat, linear-gradient(var(--mango), var(--mango)) bottom / 100% 0.03em no-repeat, repeating-linear-gradient(90deg, var(--mango) 0 0.05em, transparent 0.05em 0.2em); }

  .hero { padding: 40px 24px 80px; }
  .lede { font-size: 30px; line-height: 1.3; max-width: 700px; margin: 0 auto 1.5rem; }
  .lede strong { display: block; }
  .pill { display: inline-block; background: var(--mango); border-radius: 6px; padding: 6px 14px; font-size: 15px; font-weight: 600; margin-bottom: 56px; }
  .stage { max-width: 1170px; margin: 0 auto; background: #211710; border-radius: 10px; overflow: hidden; text-align: left; box-shadow: 0 30px 60px rgb(0 0 0 / 0.2); }
  .tabs { display: flex; gap: 6px; padding: 12px 12px 0; background: #2a1e16; border-bottom: 1px solid #4a3628; }
  .tabs button { font: 600 16px var(--sans); color: #e4d2bc; background: #2f2219; border: 1px solid #4a3628; border-bottom: 0; padding: 11px 22px; border-radius: 8px 8px 0 0; cursor: pointer; transition: background-color 0.15s ease, color 0.15s ease; }
  .tabs button:hover { background: #3a2a1f; color: #fff; }
  .tabs button[aria-selected="true"] { background: #3a2a1f; color: #fff; box-shadow: inset 0 3px 0 var(--orange); margin-bottom: -1px; padding-bottom: 12px; }
  .note { margin: 0; padding: 0 22px 22px; font-size: 15px; color: #d9c6b0; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  .fine { font-size: 15px; line-height: 1.45; max-width: 760px; margin: 1.5rem auto 0; color: #7a6450; }
  .pane { background: #3a2a1f; min-height: 380px; }
  .split { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); }
  .split > div + div { border-left: 1px solid #4a3628; }
  .pane .file { text-align: left; padding: 8px 22px; }
  .pane :global(pre) { margin: 0; padding: 22px; font: 15px/1.65 var(--mono); background: transparent !important; overflow-x: auto; }
  .ai { display: flex; align-items: center; justify-content: center; gap: 48px; padding: 32px 40px; }
  .meme { display: block; width: 260px; height: auto; border-radius: 8px; }
  .disclaimer { max-width: 560px; margin: 0; font-size: 19px; line-height: 1.5; color: #fbf1e4; }
  .pane :global(.squiggle) { text-decoration: underline wavy #ff5d5d; text-underline-offset: 4px; }
  .pane :global(.tip) { display: block; width: max-content; max-width: 100%; margin: 6px 0 4px 2ch; padding: 8px 12px; background: #2b1d14; border: 1px solid #ff5d5d; border-radius: 6px; color: #ffb4b4; font-size: 13px; white-space: normal; }

  .company { padding: 40px 24px 100px; }
  .tiles { display: grid; grid-template-columns: repeat(4, 220px); justify-content: center; gap: 18px; list-style: none; padding: 0; margin: 48px 0; }
  .tiles a { display: flex; flex-direction: column; justify-content: center; gap: 2px; height: 84px; background: var(--tint); border-radius: 8px; font-weight: 700; font-size: 20px; transition: background-color 0.15s ease, color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease; }
  .tiles a:hover, .tiles a:focus-visible { background: var(--orange); color: #fff; transform: translateY(-2px); box-shadow: 0 6px 18px rgb(0 0 0 / 0.12); }
  .tiles a:hover small, .tiles a:focus-visible small { color: rgb(255 255 255 / 0.85); }
  .tiles li:nth-last-child(2) { grid-column: 2; }
  .tiles small { font-size: 13px; font-weight: 500; color: #7a6450; }

  .band { background: var(--tint); padding: 90px 24px; }
  .company + .band { clip-path: polygon(0 0, 100% 3vw, 100% 100%, 0 100%); padding-top: calc(90px + 3vw); }
  .band:has(+ .start) { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 calc(100% - 7vw)); padding-bottom: calc(90px + 7vw); }
  .foot { clip-path: polygon(0 4.5vw, 38% 0, 100% 1.5vw, 100% 100%, 0 100%); padding-top: calc(60px + 4.5vw) !important; }
  .card { background: #fff; max-width: 1170px; margin: 90px auto 0; padding: 60px 80px; border-radius: 10px; box-shadow: 0 10px 40px rgb(0 0 0 / 0.08); }
  .band > .card:first-child { margin-top: 0; }

  .blocks { padding-top: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 560px)); justify-content: center; column-gap: 50px; }
  .block { display: grid; grid-row: span 3; grid-template-rows: subgrid; row-gap: 0; padding-bottom: 60px; }
  .code { display: flex; flex-direction: column; }
  .code { background: #3a2a1f; border-radius: 6px; overflow: hidden; text-align: left; }
  .file { display: block; background: #2a1e16; color: #e4d2bc; font: 13px var(--mono); text-align: center; padding: 8px; }
  div.file { text-decoration: none; }
  .code :global(pre) { flex: 1; margin: 0; padding: 20px; font: 13px/1.6 var(--mono); overflow-x: auto; background: #3a2a1f !important; }
  .block p { font-size: 21px; line-height: 26px; margin: 0 auto; max-width: 500px; }

  .start { padding: 90px 24px; }
  .cards { display: grid; grid-template-columns: repeat(2, 340px); justify-content: center; gap: 30px; margin-top: 40px; }
  .start-card { position: relative; display: flex; flex-direction: column; gap: 8px; padding: 40px 24px 28px; border-radius: 8px; box-shadow: 0 6px 24px rgb(0 0 0 / 0.1); text-decoration: none; font-size: 18px; line-height: 23px; }
  .start-card strong { font-size: 26px; line-height: 31px; text-decoration: underline; text-underline-offset: 3px; }
  .tag { position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: var(--mango); color: var(--ink); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 3px 10px; border-radius: 3px; }

  .install { max-width: 760px; margin: 56px auto 0; text-align: left; }
  .pms { display: flex; gap: 4px; }
  .pms button { font: 600 14px var(--mono); color: var(--ink); background: none; border: 0; padding: 8px 14px; border-radius: 6px 6px 0 0; cursor: pointer; }
  .pms button[aria-pressed="true"] { background: var(--ink); color: #fff; }
  .cmd { display: flex; align-items: center; gap: 16px; background: var(--ink); color: #fbf1e4; border-radius: 0 8px 8px 8px; padding: 18px 20px; }
  .cmd code { flex: 1; font: 16px var(--mono); color: #fbf1e4; background: none; border: 0; padding: 0; overflow-x: auto; white-space: nowrap; }
  .prompt { color: var(--mango); margin-right: 6px; }
  .copy { font: 600 13px var(--sans); background: #3a2a1f; color: #fff; border: 0; border-radius: 5px; padding: 6px 12px; cursor: pointer; }
  .foot { background: var(--tint); padding: 60px 24px; font-size: 14px; }
  .foot ul { display: flex; justify-content: center; gap: 28px; list-style: none; margin: 0 0 12px; padding: 0; }
  .foot p { margin: 0; color: #7a6450; }

  @media (max-width: 900px) {
    h1 { font-size: 44px; line-height: 1.05; }
    h2 { font-size: 38px; line-height: 1.05; }
    h3 { font-size: 26px; line-height: 1.15; }
    .intro { font-size: 24px; line-height: 1.3; }
    .small { font-size: 19px; line-height: 1.4; }
    .nav { grid-template-columns: 1fr; gap: 12px; }
    .mark { order: -1; justify-self: center; }
    .nav ul { justify-content: center; flex-wrap: wrap; gap: 16px; }
    .tiles { grid-template-columns: repeat(2, 1fr); }
    .tiles li:nth-last-child(2) { grid-column: auto; }
    .blocks, .cards, .split { grid-template-columns: 1fr; }
    .split > div + div { border-left: 0; border-top: 1px solid #4a3628; }
    .ai { flex-direction: column; }
    .card { padding: 40px 24px; }
  }
</style>
