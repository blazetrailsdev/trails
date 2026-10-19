import type { ParamInfo } from "@blazetrails/parity/types";

/** The settled trails block idiom, which a flagged row is fixed TOWARDS — see
 *  the rule's message in lint-block-params.ts. */
export const BLOCK_IDIOM =
  "A Ruby block ports as a TRAILING function-typed parameter (`fn` / `block`, the " +
  "names arity.ts strips as a ported `&block`); where Rails reads one argument as " +
  "value-or-block, mark it with `block()` from @blazetrails/ruby-compat.";

/**
 * Block-PARAMETER comparison (RFC 0156). A Ruby block is not a declared
 * positional unless spelled `&block`, so the params gate cannot see a dropped
 * `yield` / `block_given?` arm (`find_each`, `relation/batches.rb:85`).
 *
 * Does the port drop Rails' block? True when Ruby takes one and NO TS signature
 * recorded for the pair has a parameter admitting a function. Any candidate
 * clears it: which overload carries the block is the port's business.
 */
export function dropsBlock(rubyTakesBlock: boolean, candidates: ParamInfo[][]): boolean {
  if (!rubyTakesBlock || candidates.length === 0) return false;
  return !candidates.some((sig) => sig.some((p) => p.admitsFunction === true));
}

/** The block a generator method takes: its `yield` hands each value to the
 *  caller's `for…of`, the JS shape of a Ruby block whose body uses a non-local
 *  `return` / `next` or an `await` (`Journey::Router#find_routes` under
 *  `serve`, `journey/router.rb:33-65`), which a JS callback cannot take. */
export const GENERATOR_BLOCK: ParamInfo[] = [{ name: "yield", kind: "rest", admitsFunction: true }];
