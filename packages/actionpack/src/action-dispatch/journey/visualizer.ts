/**
 * HTML rendering for `ActionDispatch::Journey::GTG::TransitionTable#visualizer`.
 *
 * Mirrors `action_dispatch/journey/visualizer/index.html.erb` — the
 * bundled `fsm.css` / `fsm.js` assets are inlined verbatim from
 * `./visualizer-assets.js` so the returned HTML is functionally identical
 * to Rails' (interactive d3 FSM with route simulation), modulo the ERB
 * substitution.
 */
import { FSM_CSS, FSM_JS } from "./visualizer-assets.js";

export interface VisualizerOptions {
  title: string;
  states: string;
  svg: string;
  funRoutes: readonly string[];
  paths: readonly string[];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderVisualizer(opts: VisualizerOptions): string {
  const { title, states, svg, funRoutes, paths } = opts;
  const stylesheets = [FSM_CSS];
  const javascripts = [states, FSM_JS];
  const funRouteLinks = funRoutes
    .map(
      (p) =>
        `             <a href="#" onclick="document.forms[0].elements[0].value=this.text.replace(/^\\s+|\\s+$/g,''); return match(this.text.replace(/^\\s+|\\s+$/g,''));">\n               ${escapeHtml(p)}\n             </a>`,
    )
    .join("\n");
  const pathItems = paths.map((p) => `            <li>${escapeHtml(p)}</li>`).join("\n");
  const styleBlock = stylesheets.map((s) => `        ${s}`).join("\n");
  const scriptBlock = javascripts.map((j) => `    <script>${j}</script>`).join("\n");
  return `<!DOCTYPE html>
<html>
  <head>
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/meyer-reset/2.0/reset.css" type="text/css">
    <style>
${styleBlock}
    </style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/d3/3.4.8/d3.min.js"></script>
  </head>
  <body>
    <div id="wrapper">
      <h1>Routes FSM with NFA simulation</h1>
      <div class="instruction form">
        <p>
        Type a route in to the box and click "simulate".
        </p>
        <form onsubmit="return match(this.route.value);">
          <input type="text" size="30" name="route" value="/articles/new" />
          <button>simulate</button>
          <input type="reset" value="reset" onclick="return reset_graph();"/>
        </form>
        <p class="fun_routes">
          Some fun routes to try:
${funRouteLinks}
        </p>
      </div>
      <div class='chart' id='chart-2'>
        ${svg}
      </div>
      <div class="instruction">
        <p>
        This is a FSM for a system that has the following routes:
        </p>
        <ul>
${pathItems}
        </ul>
      </div>
    </div>
${scriptBlock}
  </body>
</html>`;
}
