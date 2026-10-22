import type { N } from "../ir.js";
import type { Ctx, Lowerer } from "../lower.js";

/**
 * What a Kernel or object-protocol rule (`kernel.ts`, `object-methods.ts`) sees
 * of the call it lowers. `r` is null for an implicit-self call; `R` is the
 * receiver either way (`self` when implicit).
 */
export interface CallSite {
  lw: Lowerer;
  ctx: Ctx;
  n: N;
  name: string;
  r: string | null;
  R: string;
  recvNode: N | null;
  /** `.` or `?.` */
  nav: string;
  /** The lowered arguments, the block last. */
  args(): string[];
  argList(): string;
  /** A ruby-compat helper (`Lowerer.rc`). */
  rc(name: string): string;
}

/** A rule: the TypeScript for the call, or null to leave it to the next stage. */
export type CallRule = (c: CallSite) => string | null;

/** A rule table builder: `rule("raise fail", f)` sets `f` for each name. */
export function ruleTable(): [Record<string, CallRule>, (names: string, f: CallRule) => void] {
  const rules: Record<string, CallRule> = {};
  return [
    rules,
    (names, f) => {
      for (const k of names.split(" ")) rules[k] = f;
    },
  ];
}

/** A constant node's path (`ActiveSupport::Testing::Assertions`), or null. */
export const constName = (n: N | null | undefined): string | null =>
  n?.k === "const" ? n.path.filter((x: string) => x).join("::") : null;
