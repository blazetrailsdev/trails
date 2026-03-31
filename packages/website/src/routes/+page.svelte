<script>
  const packages = [
    { name: "ActiveRecord", path: "activerecord", desc: "ORM with migrations, associations, and query building", coverage: "71%" },
    { name: "ActiveModel", path: "activemodel", desc: "Validations, callbacks, dirty tracking, serialization", coverage: "95%" },
    { name: "ActiveSupport", path: "activesupport", desc: "Inflection, caching, notifications, encryption", coverage: "38%" },
    { name: "Arel", path: "arel", desc: "SQL AST builder and query generation", coverage: "100%" },
    { name: "Rack", path: "rack", desc: "Web server interface, middleware, request/response", coverage: "100%" },
    { name: "ActionPack", path: "actionpack", desc: "Controllers (74% API), routing, sessions, CSRF", coverage: "27%" },
  ];

  const codeExample = `import { Base, Schema } from "@blazetrails/activerecord";

class User extends Base {
  static {
    this.attribute("name", "string");
    this.attribute("email", "string");
    this.hasMany("posts");
  }
}

class Post extends Base {
  static {
    this.attribute("title", "string");
    this.attribute("body", "text");
    this.belongsTo("user");
  }
}

// Feels like Rails. Runs on TypeScript.
const users = await User.where({ name: "Alice" })
  .order("created_at")
  .limit(10);`;

  const railsVsTrails = [
    { rails: "rails new blog", trails: "trails new blog" },
    { rails: "rails generate model Post title:string", trails: "trails generate model Post title:string" },
    { rails: "rails db:migrate", trails: "trails db:migrate" },
    { rails: "rails server", trails: "trails server" },
    { rails: "User.where(name: 'Alice').order(:created_at)", trails: 'User.where({ name: "Alice" }).order("created_at")' },
  ];
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
</svelte:head>

<div class="min-h-screen" style="font-family: var(--font-sans);">

  <!-- Hero with full-bleed wilderness SVG -->
  <section class="hero-section relative w-full overflow-hidden">
    <!-- Nav overlay -->
    <nav class="absolute top-0 left-0 right-0 z-20">
      <div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <a href="/" class="text-xl font-bold" style="color: #7db060;">BlazeTrails</a>
        <div class="flex items-center gap-6">
          <a href="https://github.com/blazetrailsdev/blazetrails" class="text-sm" style="color: #e4ded4cc;" onmouseenter={(e) => e.currentTarget.style.color = '#e4ded4'} onmouseleave={(e) => e.currentTarget.style.color = '#e4ded4cc'}>GitHub</a>
        </div>
      </div>
    </nav>

    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" class="hero-svg block w-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <!-- Sky gradient — large sky area -->
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1a2a3a" />
          <stop offset="30%" stop-color="#2d4a5e" />
          <stop offset="60%" stop-color="#5a7a6a" />
          <stop offset="80%" stop-color="#8aaa7a" />
          <stop offset="100%" stop-color="#c8b890" />
        </linearGradient>
        <!-- Warm glow near horizon -->
        <radialGradient id="horizonGlow" cx="50%" cy="72%" r="40%">
          <stop offset="0%" stop-color="#d4883a" stop-opacity="0.35" />
          <stop offset="100%" stop-color="#d4883a" stop-opacity="0" />
        </radialGradient>
        <!-- Fire text gradient -->
        <linearGradient id="fireGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ff6b2a" />
          <stop offset="40%" stop-color="#e8451a" />
          <stop offset="70%" stop-color="#d4360f" />
          <stop offset="100%" stop-color="#b02a0a" />
        </linearGradient>
        <!-- Fire glow filter -->
        <filter id="fireGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0.2  0 0.4 0 0 0  0 0 0.1 0 0  0 0 0 0.6 0" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <!-- Subtle haze -->
        <filter id="haze">
          <feGaussianBlur stdDeviation="1.5" />
        </filter>

        <!-- ===== TREE SYMBOLS ===== -->
        <!-- 1. Tall Pine — narrow tiered triangle -->
        <symbol id="pine" viewBox="0 0 40 100">
          <rect x="17" y="70" width="6" height="30" fill="#4a3828" />
          <polygon points="20,0 5,40 35,40" fill="currentColor" />
          <polygon points="20,20 2,60 38,60" fill="currentColor" />
          <polygon points="20,40 0,75 40,75" fill="currentColor" />
        </symbol>

        <!-- 2. Spruce — wide bottom, pointy top -->
        <symbol id="spruce" viewBox="0 0 50 100">
          <rect x="22" y="75" width="6" height="25" fill="#4a3828" />
          <polygon points="25,0 10,35 40,35" fill="currentColor" />
          <polygon points="25,18 5,55 45,55" fill="currentColor" />
          <polygon points="25,38 0,80 50,80" fill="currentColor" />
        </symbol>

        <!-- 3. Oak — round deciduous canopy -->
        <symbol id="oak" viewBox="0 0 60 90">
          <rect x="26" y="55" width="8" height="35" fill="#5a4030" />
          <ellipse cx="30" cy="35" rx="28" ry="30" fill="currentColor" />
          <ellipse cx="18" cy="40" rx="18" ry="22" fill="currentColor" />
          <ellipse cx="42" cy="40" rx="18" ry="22" fill="currentColor" />
          <ellipse cx="30" cy="28" rx="20" ry="20" fill="currentColor" />
        </symbol>

        <!-- 4. Birch — slender with small leaf clusters -->
        <symbol id="birch" viewBox="0 0 30 100">
          <rect x="13" y="30" width="4" height="70" fill="#d4c8a8" />
          <rect x="13.5" y="40" width="3" height="5" fill="#8a7a60" opacity="0.5" />
          <rect x="13.5" y="55" width="3" height="4" fill="#8a7a60" opacity="0.5" />
          <rect x="13.5" y="68" width="3" height="3" fill="#8a7a60" opacity="0.4" />
          <ellipse cx="15" cy="22" rx="13" ry="18" fill="currentColor" />
          <ellipse cx="8" cy="30" rx="9" ry="12" fill="currentColor" />
          <ellipse cx="22" cy="30" rx="9" ry="12" fill="currentColor" />
          <ellipse cx="15" cy="15" rx="10" ry="13" fill="currentColor" />
        </symbol>

        <!-- 5. Cedar — broad layered horizontal branches -->
        <symbol id="cedar" viewBox="0 0 60 90">
          <rect x="27" y="65" width="6" height="25" fill="#4a3828" />
          <polygon points="30,0 15,25 45,25" fill="currentColor" />
          <polygon points="30,12 8,40 52,40" fill="currentColor" />
          <polygon points="30,28 3,55 57,55" fill="currentColor" />
          <polygon points="30,42 0,70 60,70" fill="currentColor" />
        </symbol>
      </defs>

      <!-- Sky -->
      <rect width="1600" height="900" fill="url(#sky)" />
      <rect width="1600" height="900" fill="url(#horizonGlow)" />

      <!-- Distant mountains — very far, hazy blue-green -->
      <path d="M0 520 Q200 380 400 440 Q500 410 620 460 Q750 370 900 430 Q1020 390 1100 450 Q1250 380 1400 420 Q1500 400 1600 450 L1600 600 L0 600Z" fill="#3a5548" opacity="0.5" filter="url(#haze)" />

      <!-- Mid mountains — green-brown -->
      <path d="M0 540 Q150 440 300 500 Q420 460 550 510 Q680 440 800 490 Q930 450 1050 500 Q1200 440 1350 480 Q1480 460 1600 500 L1600 650 L0 650Z" fill="#4a6648" opacity="0.7" />

      <!-- Very distant tree line — tiny, on the mid mountains -->
      <g color="#3a5540" opacity="0.5">
        <use href="#pine" x="60" y="488" width="10" height="35" />
        <use href="#spruce" x="105" y="478" width="12" height="38" />
        <use href="#pine" x="148" y="485" width="9" height="32" />
        <use href="#pine" x="210" y="470" width="11" height="36" />
        <use href="#cedar" x="268" y="476" width="14" height="34" />
        <use href="#pine" x="340" y="468" width="10" height="35" />
        <use href="#spruce" x="395" y="462" width="12" height="38" />
        <use href="#pine" x="435" y="470" width="9" height="32" />
        <use href="#oak" x="510" y="458" width="16" height="30" />
        <use href="#pine" x="575" y="452" width="11" height="36" />
        <use href="#spruce" x="622" y="448" width="12" height="38" />
        <use href="#pine" x="688" y="445" width="10" height="34" />
        <use href="#cedar" x="745" y="450" width="14" height="34" />
        <use href="#pine" x="818" y="442" width="9" height="32" />
        <use href="#spruce" x="870" y="448" width="12" height="38" />
        <use href="#pine" x="938" y="440" width="11" height="36" />
        <use href="#oak" x="998" y="445" width="16" height="30" />
        <use href="#pine" x="1065" y="438" width="10" height="35" />
        <use href="#pine" x="1120" y="442" width="9" height="32" />
        <use href="#spruce" x="1188" y="435" width="12" height="38" />
        <use href="#cedar" x="1255" y="440" width="14" height="34" />
        <use href="#pine" x="1330" y="438" width="10" height="35" />
        <use href="#pine" x="1388" y="442" width="11" height="36" />
        <use href="#spruce" x="1450" y="436" width="12" height="38" />
        <use href="#pine" x="1525" y="440" width="9" height="32" />
        <use href="#oak" x="1568" y="438" width="16" height="30" />
      </g>

      <!-- Rolling hills — back layer -->
      <path d="M0 580 Q100 530 250 560 Q400 520 550 555 Q700 515 850 550 Q1000 520 1150 545 Q1300 510 1450 540 Q1550 525 1600 550 L1600 700 L0 700Z" fill="#3d5a35" />

      <!-- Forest tree line — back row (distant, smaller, irregular spacing) -->
      <g color="#2d4a28" opacity="0.8">
        <use href="#pine" x="30" y="508" width="14" height="48" />
        <use href="#spruce" x="58" y="500" width="18" height="58" />
        <use href="#pine" x="105" y="512" width="13" height="45" />
        <use href="#pine" x="118" y="506" width="16" height="52" />
        <use href="#cedar" x="168" y="494" width="20" height="54" />
        <use href="#oak" x="230" y="498" width="22" height="48" />
        <use href="#pine" x="295" y="504" width="15" height="50" />
        <use href="#birch" x="312" y="496" width="11" height="52" />
        <use href="#spruce" x="380" y="490" width="19" height="62" />
        <use href="#pine" x="420" y="502" width="13" height="46" />
        <use href="#pine" x="438" y="494" width="17" height="55" />
        <use href="#cedar" x="490" y="486" width="21" height="56" />
        <use href="#oak" x="548" y="482" width="23" height="50" />
        <use href="#pine" x="610" y="490" width="14" height="48" />
        <use href="#spruce" x="632" y="484" width="20" height="60" />
        <use href="#birch" x="695" y="480" width="12" height="54" />
        <use href="#pine" x="742" y="486" width="16" height="52" />
        <use href="#cedar" x="790" y="478" width="22" height="58" />
        <use href="#pine" x="855" y="482" width="13" height="46" />
        <use href="#oak" x="878" y="476" width="24" height="50" />
        <use href="#spruce" x="945" y="474" width="18" height="58" />
        <use href="#pine" x="985" y="480" width="15" height="50" />
        <use href="#pine" x="1030" y="476" width="17" height="54" />
        <use href="#birch" x="1068" y="472" width="11" height="52" />
        <use href="#cedar" x="1125" y="468" width="20" height="56" />
        <use href="#pine" x="1182" y="474" width="14" height="48" />
        <use href="#oak" x="1210" y="466" width="22" height="50" />
        <use href="#spruce" x="1278" y="470" width="19" height="58" />
        <use href="#pine" x="1340" y="472" width="16" height="52" />
        <use href="#pine" x="1358" y="466" width="13" height="46" />
        <use href="#cedar" x="1418" y="464" width="21" height="55" />
        <use href="#birch" x="1470" y="468" width="12" height="52" />
        <use href="#spruce" x="1520" y="466" width="18" height="58" />
        <use href="#pine" x="1572" y="462" width="15" height="50" />
      </g>

      <!-- Rolling hills — mid layer -->
      <path d="M0 620 Q200 570 400 600 Q600 560 800 590 Q1000 555 1200 585 Q1400 560 1600 590 L1600 750 L0 750Z" fill="#4a6a3a" />

      <!-- Forest tree line — mid row (clustered irregularly) -->
      <g color="#2a5022">
        <use href="#spruce" x="15" y="542" width="26" height="74" />
        <use href="#pine" x="48" y="538" width="20" height="72" />
        <use href="#oak" x="90" y="536" width="32" height="65" />
        <use href="#pine" x="145" y="540" width="21" height="70" />
        <use href="#cedar" x="162" y="532" width="28" height="72" />
        <use href="#birch" x="232" y="536" width="15" height="68" />
        <use href="#spruce" x="275" y="528" width="30" height="80" />
        <use href="#pine" x="310" y="534" width="20" height="70" />
        <use href="#pine" x="328" y="530" width="24" height="76" />
        <use href="#oak" x="395" y="526" width="36" height="70" />
        <use href="#cedar" x="448" y="524" width="28" height="72" />
        <use href="#pine" x="510" y="522" width="22" height="76" />
        <use href="#birch" x="538" y="520" width="14" height="66" />
        <use href="#spruce" x="585" y="516" width="26" height="78" />
        <use href="#pine" x="648" y="518" width="20" height="70" />
        <use href="#oak" x="672" y="514" width="34" height="68" />
        <use href="#cedar" x="745" y="510" width="30" height="74" />
        <use href="#pine" x="792" y="514" width="22" height="72" />
        <use href="#spruce" x="838" y="508" width="28" height="78" />
        <use href="#birch" x="895" y="510" width="15" height="66" />
        <use href="#pine" x="928" y="506" width="24" height="76" />
        <use href="#pine" x="978" y="504" width="20" height="70" />
        <use href="#oak" x="1015" y="500" width="36" height="68" />
        <use href="#cedar" x="1088" y="498" width="28" height="72" />
        <use href="#spruce" x="1135" y="496" width="26" height="78" />
        <use href="#pine" x="1195" y="498" width="22" height="74" />
        <use href="#birch" x="1218" y="494" width="14" height="66" />
        <use href="#pine" x="1275" y="492" width="24" height="76" />
        <use href="#oak" x="1320" y="490" width="34" height="68" />
        <use href="#cedar" x="1395" y="488" width="30" height="72" />
        <use href="#spruce" x="1438" y="486" width="26" height="78" />
        <use href="#pine" x="1498" y="488" width="22" height="72" />
        <use href="#birch" x="1530" y="484" width="15" height="66" />
        <use href="#pine" x="1575" y="486" width="20" height="70" />
      </g>

      <!-- Rolling hills — front layer -->
      <path d="M0 670 Q150 630 350 655 Q550 620 750 645 Q950 615 1150 640 Q1350 620 1600 650 L1600 800 L0 800Z" fill="#3a5a2e" />

      <!-- Forest tree line — front row (closer, larger, clustered with gaps) -->
      <g color="#1e3a18">
        <!-- dense cluster left -->
        <use href="#pine" x="-8" y="558" width="30" height="100" />
        <use href="#oak" x="18" y="554" width="50" height="98" />
        <use href="#spruce" x="62" y="560" width="36" height="105" />
        <use href="#pine" x="88" y="552" width="28" height="108" />
        <!-- sparse gap -->
        <use href="#birch" x="175" y="558" width="18" height="90" />
        <!-- cluster -->
        <use href="#cedar" x="240" y="545" width="44" height="108" />
        <use href="#pine" x="278" y="550" width="30" height="102" />
        <use href="#spruce" x="302" y="542" width="40" height="110" />
        <use href="#oak" x="348" y="546" width="46" height="95" />
        <use href="#pine" x="385" y="540" width="28" height="105" />
        <!-- gap with lone birch -->
        <use href="#birch" x="462" y="542" width="18" height="92" />
        <!-- dense cluster mid-left -->
        <use href="#cedar" x="525" y="532" width="42" height="108" />
        <use href="#pine" x="558" y="536" width="32" height="105" />
        <use href="#pine" x="582" y="530" width="28" height="100" />
        <use href="#oak" x="622" y="528" width="52" height="98" />
        <!-- sparse -->
        <use href="#spruce" x="718" y="526" width="36" height="108" />
        <!-- cluster right of center -->
        <use href="#pine" x="798" y="522" width="32" height="108" />
        <use href="#cedar" x="825" y="518" width="44" height="105" />
        <use href="#oak" x="880" y="520" width="48" height="96" />
        <use href="#birch" x="932" y="518" width="18" height="90" />
        <use href="#pine" x="955" y="514" width="30" height="105" />
        <!-- gap -->
        <use href="#spruce" x="1050" y="510" width="38" height="110" />
        <!-- big cluster right -->
        <use href="#pine" x="1118" y="508" width="28" height="102" />
        <use href="#oak" x="1142" y="504" width="50" height="98" />
        <use href="#cedar" x="1198" y="506" width="42" height="105" />
        <use href="#pine" x="1238" y="502" width="34" height="108" />
        <use href="#spruce" x="1265" y="498" width="36" height="108" />
        <!-- sparse -->
        <use href="#birch" x="1348" y="502" width="18" height="90" />
        <use href="#pine" x="1395" y="498" width="30" height="105" />
        <!-- tight cluster far right -->
        <use href="#oak" x="1448" y="496" width="48" height="96" />
        <use href="#spruce" x="1492" y="498" width="38" height="108" />
        <use href="#pine" x="1535" y="494" width="28" height="102" />
        <use href="#cedar" x="1558" y="492" width="42" height="105" />
      </g>

      <!-- Foreground hills — earthy brown -->
      <path d="M0 730 Q200 690 400 710 Q600 680 800 705 Q1000 675 1200 700 Q1400 680 1600 710 L1600 900 L0 900Z" fill="#3a3020" />

      <!-- Foreground ground — dark earth -->
      <path d="M0 790 Q400 760 800 775 Q1200 755 1600 770 L1600 900 L0 900Z" fill="#2a2218" />

      <!-- Foreground tree row — very close, large, some clipped by bottom edge -->
      <g color="#152e12">
        <use href="#oak" x="-30" y="680" width="70" height="140" />
        <use href="#pine" x="55" y="690" width="45" height="150" />
        <use href="#spruce" x="140" y="685" width="52" height="155" />
        <use href="#cedar" x="260" y="678" width="58" height="150" />
        <use href="#birch" x="365" y="688" width="25" height="130" />
        <use href="#pine" x="430" y="675" width="48" height="155" />
        <use href="#oak" x="520" y="682" width="65" height="138" />
        <use href="#spruce" x="640" y="672" width="52" height="155" />
        <use href="#pine" x="735" y="678" width="45" height="150" />
        <use href="#cedar" x="855" y="670" width="58" height="152" />
        <use href="#birch" x="960" y="675" width="25" height="130" />
        <use href="#oak" x="1020" y="668" width="68" height="140" />
        <use href="#pine" x="1135" y="672" width="48" height="155" />
        <use href="#spruce" x="1230" y="665" width="55" height="158" />
        <use href="#birch" x="1338" y="670" width="25" height="130" />
        <use href="#cedar" x="1395" y="662" width="58" height="155" />
        <use href="#pine" x="1498" y="668" width="48" height="152" />
        <use href="#oak" x="1555" y="660" width="65" height="140" />
      </g>

      <!-- ===== BLAZETRAILS WORDMARK ===== -->
      <text x="800" y="380" font-family="Inter, system-ui, sans-serif" font-size="108" font-weight="800" letter-spacing="-2" text-anchor="middle">
        <tspan fill="url(#fireGrad)" filter="url(#fireGlow)">Blaze</tspan><tspan fill="#6b9e50">Trails</tspan>
      </text>

      <!-- Tagline -->
      <text x="800" y="430" font-family="Inter, system-ui, sans-serif" font-size="22" font-weight="500" fill="#c8b890" text-anchor="middle" opacity="0.9">The Rails API, in TypeScript.</text>
    </svg>

    <!-- CTA buttons overlaid at bottom of hero -->
    <div class="hero-cta absolute bottom-8 left-0 right-0 z-10 flex justify-center gap-4">
      <a href="https://github.com/blazetrailsdev/blazetrails" class="rounded-lg px-6 py-3 font-medium text-sm" style="background: #6b9e50; color: #1c1916; font-family: var(--font-sans);">
        Get Started
      </a>
      <a href="#packages" class="rounded-lg border px-6 py-3 font-medium text-sm" style="border-color: #8a7a60; color: #e4ded4; font-family: var(--font-sans);">
        View Packages
      </a>
    </div>
  </section>

  <!-- Side-by-side: Rails vs Trails -->
  <section class="border-y border-border/50 bg-surface-raised py-20">
    <div class="mx-auto max-w-5xl px-6">
      <h2 class="mb-2 text-center text-sm font-medium uppercase tracking-wider text-text-muted">Rails to Trails</h2>
      <p class="mb-12 text-center text-2xl font-bold text-text">Same intent, same names.</p>
      <div class="overflow-hidden rounded-lg border border-border">
        <div class="grid grid-cols-2 border-b border-border bg-surface-overlay text-xs font-medium text-text-muted">
          <div class="px-4 py-2">Ruby on Rails</div>
          <div class="border-l border-border px-4 py-2">BlazeTrails</div>
        </div>
        {#each railsVsTrails as { rails, trails }}
          <div class="grid grid-cols-2 border-b border-border/50 last:border-0">
            <div class="px-4 py-3 font-mono text-xs text-text-muted">{rails}</div>
            <div class="border-l border-border px-4 py-3 font-mono text-xs text-accent">{trails}</div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- Code example -->
  <section class="py-20">
    <div class="mx-auto max-w-5xl px-6">
      <div class="grid gap-12 lg:grid-cols-2">
        <div>
          <h2 class="mb-4 text-2xl font-bold text-text">Feels familiar.<br />Types make it better.</h2>
          <p class="mb-6 text-text-muted leading-relaxed">
            BlazeTrails isn't a reimagination of Rails. It's a faithful port.
            ActiveRecord, ActiveModel, Arel, Rack — they're all here, with the same
            class hierarchy and the same call signatures. TypeScript adds the safety
            that Ruby can't.
          </p>
          <ul class="space-y-3 text-sm text-text-muted">
            <li class="flex items-start gap-2">
              <span class="mt-0.5 text-accent">--</span>
              <span>Typed column references, not magic strings</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="mt-0.5 text-accent">--</span>
              <span>Async/await instead of synchronous blocking</span>
            </li>
            <li class="flex items-start gap-2">
              <span class="mt-0.5 text-accent">--</span>
              <span>Same test names, validated against the Rails test suite</span>
            </li>
          </ul>
        </div>
        <div class="overflow-hidden rounded-lg border border-border bg-surface-raised">
          <div class="flex items-center gap-2 border-b border-border px-4 py-2">
            <span class="h-2.5 w-2.5 rounded-full bg-error/60"></span>
            <span class="h-2.5 w-2.5 rounded-full bg-warning/60"></span>
            <span class="h-2.5 w-2.5 rounded-full bg-accent/60"></span>
            <span class="ml-2 font-mono text-[10px] text-text-muted">app/models.ts</span>
          </div>
          <pre class="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-text-muted">{codeExample}</pre>
        </div>
      </div>
    </div>
  </section>

  <!-- Packages -->
  <section id="packages" class="border-y border-border/50 bg-surface-raised py-20">
    <div class="mx-auto max-w-5xl px-6">
      <h2 class="mb-2 text-center text-sm font-medium uppercase tracking-wider text-text-muted">Packages</h2>
      <p class="mb-12 text-center text-2xl font-bold text-text">The full stack, piece by piece.</p>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each packages as pkg}
          <div class="rounded-lg border border-border bg-surface p-5">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="font-mono text-sm font-semibold text-text">{pkg.name}</h3>
              <span class="rounded bg-surface-overlay px-2 py-0.5 font-mono text-[10px] text-text-muted">{pkg.coverage}</span>
            </div>
            <p class="mb-3 text-xs leading-relaxed text-text-muted">{pkg.desc}</p>
            <code class="text-[10px] text-accent">@blazetrails/{pkg.path}</code>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="border-t border-border/50 py-8">
    <div class="mx-auto max-w-5xl px-6">
      <div class="flex items-center justify-between text-xs text-text-muted">
        <span>BlazeTrails</span>
        <div class="flex gap-6">
          <a href="https://github.com/blazetrailsdev/blazetrails" class="hover:text-text">GitHub</a>
        </div>
      </div>
    </div>
  </footer>
</div>
