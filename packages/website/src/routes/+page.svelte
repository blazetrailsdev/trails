<script>
  import "@fontsource-variable/bricolage-grotesque";
  import "@fontsource-variable/instrument-sans";
  import "@fontsource-variable/jetbrains-mono";
  import { base } from "$app/paths";

  let { data } = $props();
  let tab = $state("same");

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

  const tiles = [
    "activerecord", "activemodel", "actionpack", "actionview",
    "actionmailer", "actionmailbox", "actiontext", "activejob",
    "activestorage", "actioncable", "activesupport", "arel",
    "rack", "trailties", "solid-queue", "solid-cache",
    "solid-cable", "turbo", "stimulus", "vite-trails",
    "i18n", "thor",
  ];


  const cards = [
    { tag: "Learning", title: "Read the guides", body: "Learn what the frameworks can do and how they fit together.", href: guides },
    { tag: "Source", title: "Browse on GitHub", body: "Read the code and the Rails source it mirrors.", href: repo },
    { tag: "Keeping up", title: "See what’s new", body: "The latest releases and updates on development.", href: `${repo}/commits/main` },
  ];
</script>

<svelte:head>
  <title>BlazeTrails</title>
</svelte:head>

<div class="page">
  <div class="announce"><a href={repo}>trails is open source on GitHub &rarr;</a></div>

  <nav class="nav">
    <ul class="left">{#each navLeft as l}<li><a href={l.href}>{l.label}</a></li>{/each}</ul>
    <a href="{base}/" class="mark" aria-label="BlazeTrails home">
      <span class="wm"><span class="blaze">blaze</span>tra<span class="i">ı</span>ls</span>
    </a>
    <ul class="right">{#each navRight as l}<li><a href={l.href}>{l.label}</a></li>{/each}</ul>
  </nav>

  <header class="hero">
    <h1>Convention over configuration.<br />Now with types.</h1>
    <p class="lede">trails is Rails in TypeScript: the same names and conventions, plus a compiler that catches what your agents get wrong.</p>
    <span class="pill">trails &mdash; pre-release &middot; measured at {data.measuredAt}</span>
    <div class="stage">
      <div class="tabs">
        <button aria-pressed={tab === "same"} onclick={() => (tab = "same")}>Same method</button>
        <button aria-pressed={tab === "caught"} onclick={() => (tab = "caught")}>Caught by the compiler</button>
        <button aria-pressed={tab === "ai"} onclick={() => (tab = "ai")}>AI disclaimer</button>
      </div>
      {#if tab === "same"}
        <div class="split">
          <div class="pane"><div class="file">app/models/post.rb &middot; Rails</div>{@html data.hero.rails}</div>
          <div class="pane"><div class="file">app/models/post.ts &middot; trails</div>{@html data.hero.trails}</div>
        </div>
      {:else if tab === "caught"}
        <div class="pane"><div class="file">app/models/check.ts &middot; pnpm build</div>{@html data.hero.check}</div>
      {:else}
        <div class="pane ai">
          <img class="meme" src="{base}/claude-push-rails-to-typescript.jpg" width="343" height="604" alt="Patrick Star meme. Top panel: Claude: take Rails. Bottom panel: and push it to TypeScript. Make no mistakes." />
          <p class="disclaimer"><strong>AI was used to build trails.</strong> Most of its code, tests and docs were written by Claude, Anthropic's AI model, working from the vendored Rails source under human direction and review. Every change, whoever wrote it, has to pass the same parity gates and CI before it merges.</p>
        </div>
      {/if}
    </div>
  </header>

  <section class="company">
    <h2>All the familiar gems, dressed in TypeScript.</h2>
    <p class="intro">trails ports the Rails frameworks to TypeScript, one package per framework.</p>
    <ul class="tiles">{#each tiles as t}<li><a href="{repo}/tree/main/packages/{t}"><span>{t}</span>{#if data.coverage[t] && data.coverage[t] !== "—"}<small>{data.coverage[t]} of the Rails API</small>{/if}</a></li>{/each}</ul>
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
    {#each data.blocks as b}
      <div class="block">
        <div class="code">
          <div class="file">{b.file} &middot; placeholder</div>
          {@html b.html}
        </div>
        <h3>{b.title}</h3>
        <p>{b.body}</p>
      </div>
    {/each}
  </section>

  <section class="band">
    <div class="card">
      <h2>Optimized for seasoned Rails developers.</h2>
      <p class="small"><strong>Bring the Rails you already know, and let agents write the types.</strong> Use the vocabulary you know to write Rails at the speed of agents. Deploy serverless to Lambda or Cloudflare. Use Active Record in a React Native app. Run the full stack in the browser. Dream big.</p>
      <a class="cta" href="{base}/docs/guides/idioms">Blaze trails &rsaquo;</a>
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
  a { color: inherit; }
  h1, h2, h3 { font-family: var(--display); }
  h1, h2 { color: var(--orange); font-weight: 800; letter-spacing: -0.035em; margin: 0 auto 1.5rem; }
  h1 { font-size: 78px; line-height: 72px; max-width: 1200px; }
  h2 { font-size: 56px; line-height: 1; }
  h3 { color: var(--orange); font-size: 28px; margin: 1.5rem 0 0.5rem; }
  .intro { font-size: 26px; line-height: 1.3; max-width: 780px; margin: 0 auto 1.5rem; }
  .small { font-size: 17px; max-width: 760px; margin: 1.5rem auto 0; }
  .cta { font-weight: 700; text-decoration: underline; text-underline-offset: 4px; font-size: 19px; }

  .announce { background: var(--ink); color: #fff; font-size: 15px; font-weight: 600; padding: 8px; }
  .announce a { text-decoration: none; }

  .nav { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 40px; padding: 20px 40px; }
  .nav ul { display: flex; gap: 36px; list-style: none; margin: 0; padding: 0; font-size: 16px; font-weight: 600; }
  .nav a { text-decoration: none; }
  .left { justify-content: flex-end; }
  .mark { text-decoration: none; }
  .wm { font: 800 44px/1 var(--display); letter-spacing: -0.045em; color: var(--ink); }
  .blaze { color: var(--orange); }
  .i { position: relative; }
  .i::before { content: ""; position: absolute; left: 50%; transform: translateX(-50%); top: 0.02em; width: 0.26em; height: 0.17em; background: var(--mango); border-radius: 0.035em; }

  .hero { padding: 40px 24px 80px; }
  .lede { font-size: 30px; line-height: 1.3; max-width: 700px; margin: 0 auto 1.5rem; }
  .lede strong { display: block; }
  .pill { display: inline-block; background: var(--mango); border-radius: 6px; padding: 6px 14px; font-size: 15px; font-weight: 600; margin-bottom: 56px; }
  .stage { max-width: 1170px; margin: 0 auto; background: #211710; border-radius: 10px; overflow: hidden; text-align: left; box-shadow: 0 30px 60px rgb(0 0 0 / 0.2); }
  .tabs { display: flex; gap: 4px; padding: 10px 10px 0; background: #2a1e16; }
  .tabs button { font: 600 15px var(--sans); color: #d9c6b0; background: none; border: 0; padding: 10px 18px; border-radius: 6px 6px 0 0; cursor: pointer; }
  .tabs button[aria-pressed="true"] { background: #3a2a1f; color: #fff; }
  .split { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #2a1e16; }
  .pane { background: #3a2a1f; min-height: 380px; }
  .pane :global(pre) { margin: 0; padding: 22px; font: 15px/1.65 var(--mono); background: transparent !important; overflow-x: auto; }
  .ai { display: flex; align-items: center; justify-content: center; gap: 48px; padding: 32px 40px; }
  .meme { display: block; width: 260px; height: auto; border-radius: 8px; }
  .disclaimer { max-width: 560px; margin: 0; font-size: 19px; line-height: 1.5; color: #fbf1e4; }
  .pane :global(.squiggle) { text-decoration: underline wavy #ff5d5d; text-underline-offset: 4px; }
  .pane :global(.tip) { display: block; width: max-content; max-width: 100%; margin: 6px 0 4px 2ch; padding: 8px 12px; background: #2b1d14; border: 1px solid #ff5d5d; border-radius: 6px; color: #ffb4b4; font-size: 13px; white-space: normal; }

  .company { padding: 40px 24px 100px; }
  .tiles { display: grid; grid-template-columns: repeat(4, 220px); justify-content: center; gap: 18px; list-style: none; padding: 0; margin: 48px 0; }
  .tiles a { display: flex; flex-direction: column; justify-content: center; gap: 2px; height: 84px; background: var(--tint); border-radius: 8px; font-weight: 700; font-size: 20px; text-decoration: none; }
  .tiles li:nth-last-child(2) { grid-column: 2; }
  .tiles small { font-size: 13px; font-weight: 500; color: #7a6450; }

  .band { background: var(--tint); padding: 90px 24px; }
  .card { background: #fff; max-width: 1170px; margin: 90px auto 0; padding: 60px 80px; border-radius: 10px; box-shadow: 0 10px 40px rgb(0 0 0 / 0.08); }
  .band > .card:first-child { margin-top: 0; }

  .blocks { padding-top: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 560px)); justify-content: center; column-gap: 50px; }
  .block { display: grid; grid-row: span 3; grid-template-rows: subgrid; row-gap: 0; padding-bottom: 60px; }
  .code { display: flex; flex-direction: column; }
  .code { background: #3a2a1f; border-radius: 6px; overflow: hidden; text-align: left; }
  .file { background: #2a1e16; color: #e4d2bc; font: 13px var(--mono); text-align: center; padding: 8px; }
  .code :global(pre) { flex: 1; margin: 0; padding: 20px; font: 13px/1.6 var(--mono); overflow-x: auto; background: #3a2a1f !important; }
  .block p { font-size: 17px; margin: 0 auto; max-width: 500px; }

  .start { padding: 90px 24px; }
  .cards { display: grid; grid-template-columns: repeat(3, 340px); justify-content: center; gap: 30px; margin-top: 40px; }
  .start-card { position: relative; display: flex; flex-direction: column; gap: 8px; padding: 40px 24px 28px; border-radius: 8px; box-shadow: 0 6px 24px rgb(0 0 0 / 0.1); text-decoration: none; font-size: 15px; }
  .start-card strong { font-size: 19px; text-decoration: underline; text-underline-offset: 3px; }
  .tag { position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: var(--mango); color: var(--ink); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 3px 10px; border-radius: 3px; }

  .install { max-width: 760px; margin: 56px auto 0; text-align: left; }
  .pms { display: flex; gap: 4px; }
  .pms button { font: 600 14px var(--mono); color: var(--ink); background: none; border: 0; padding: 8px 14px; border-radius: 6px 6px 0 0; cursor: pointer; }
  .pms button[aria-pressed="true"] { background: var(--ink); color: #fff; }
  .cmd { display: flex; align-items: center; gap: 16px; background: var(--ink); color: #fbf1e4; border-radius: 0 8px 8px 8px; padding: 18px 20px; }
  .cmd code { flex: 1; font: 16px var(--mono); overflow-x: auto; white-space: nowrap; }
  .prompt { color: var(--mango); margin-right: 6px; }
  .copy { font: 600 13px var(--sans); background: #3a2a1f; color: #fff; border: 0; border-radius: 5px; padding: 6px 12px; cursor: pointer; }
  .foot { background: var(--tint); padding: 60px 24px; font-size: 14px; }
  .foot ul { display: flex; justify-content: center; gap: 28px; list-style: none; margin: 0 0 12px; padding: 0; }
  .foot p { margin: 0; color: #7a6450; }

  @media (max-width: 900px) {
    h1 { font-size: 44px; line-height: 1.05; }
    h2 { font-size: 38px; }
    .nav { grid-template-columns: 1fr; gap: 12px; }
    .mark { order: -1; justify-self: center; }
    .nav ul { justify-content: center; flex-wrap: wrap; gap: 16px; }
    .tiles { grid-template-columns: repeat(2, 1fr); }
    .tiles li:nth-last-child(2) { grid-column: auto; }
    .blocks, .cards, .split { grid-template-columns: 1fr; }
    .ai { flex-direction: column; }
    .card { padding: 40px 24px; }
  }
</style>
