/**
 * Re-exports from token-for.ts for backwards compatibility.
 * The canonical location is now token-for.ts, matching Rails' token_for.rb.
 */
export {
  TokenDefinition,
  generatesTokenFor,
  generateTokenFor,
  findByTokenFor,
  findByTokenForBang,
  setTokenForSecret,
} from "./token-for.js";
