// Block-PARAMETER comparison for parity:api (RFC 0156, advisory beside the
// ratchet in lint-block-params.ts).
//
// param-names.ts compares declared positionals, and a Ruby block is not one
// unless it is spelled `&block`: a `yield` / `block_given?` method declares
// nothing. So `find_each` (`relation/batches.rb:85`) opening with
// `if block_given?` scored clean against a `findEach` that takes no function at
// all, and the block arm was silently dropped.

import type { ParamInfo } from "@blazetrails/parity/types";

/** The settled trails block idiom, which a flagged row is fixed TOWARDS — see
 *  the rule's message in lint-block-params.ts. */
export const BLOCK_IDIOM =
  "A Ruby block ports as a TRAILING function-typed parameter (`fn` / `block`, the " +
  "names arity.ts strips as a ported `&block`); where Rails reads one argument as " +
  "value-or-block, mark it with `block()` from @blazetrails/ruby-compat.";

/**
 * Does the port drop Rails' block? True when Ruby takes one and NO TS signature
 * recorded for the pair has a parameter admitting a function. Any candidate
 * clears it: which overload carries the block is the port's business.
 */
export function dropsBlock(rubyTakesBlock: boolean, candidates: ParamInfo[][]): boolean {
  if (!rubyTakesBlock || candidates.length === 0) return false;
  return !candidates.some((sig) => sig.some((p) => p.admitsFunction === true));
}
