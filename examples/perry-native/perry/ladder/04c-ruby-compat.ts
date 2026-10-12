// Real framework code, but from the foundation layer and below the
// activesupport cluster: `ruby-compat`'s own regexp module, which reaches
// neither i18n, nor date, nor the optional nokogiri backend.
//
// The path reaches into node_modules because `ruby-compat`'s `exports` map
// publishes no subpath for `regexp` — the same gap perry/runtime-graph.md
// measures. Diagnostic only; not a pattern for application code.
// @ts-expect-error — no type declarations resolve through this raw path
import { regexpEscape } from "../../node_modules/@blazetrails/ruby-compat/dist/regexp.js";
console.log(`[04c] ${regexpEscape("a.b*c") as string}`);
