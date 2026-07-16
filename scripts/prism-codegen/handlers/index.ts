/**
 * Assembles the default handler registry. New node kinds are added by writing
 * a handler module and registering it here (or by calling `registry.on(...)`
 * anywhere) — there is no central dispatch block to edit.
 */
import { Registry } from "../registry.js";
import { registerLiterals } from "./literals.js";
import { registerExpressions } from "./expressions.js";
import { registerStructure } from "./structure.js";
import { registerControl } from "./control.js";
import { registerMisc } from "./misc.js";

export function defaultRegistry(): Registry {
  const r = new Registry();
  registerLiterals(r);
  registerExpressions(r);
  registerStructure(r);
  registerControl(r);
  registerMisc(r);
  return r;
}
