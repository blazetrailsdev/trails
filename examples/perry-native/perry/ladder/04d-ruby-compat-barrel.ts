// The same function through `ruby-compat`'s package entry point: 138 modules
// against the deep import's 54 (perry/runtime-graph.md). Pairs with 04c to
// locate Perry's practical module ceiling.
import { regexpEscape } from "@blazetrails/ruby-compat";
console.log(`[04d] ${regexpEscape("a.b*c")}`);
