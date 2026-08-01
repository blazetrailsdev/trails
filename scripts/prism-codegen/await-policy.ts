import type { PrismNode } from "./types.js";

/**
 * Whether a generated call gets an `await`.
 *
 * The async manifest resolves names, not methods: two Rails files can define
 * the same `def`, and a call like `ids.first` or `record.update` names an
 * async port method while targeting something else entirely. Awaiting those is
 * a no-op only for as long as the generated output is never executed — once it
 * is applied, an await in a sync path is a behavioural change. So the rule is
 * narrowed to the receivers the AST actually pins down: an implicit self-call,
 * or an explicit `self.`. Anything reached through a local, a param, an ivar,
 * a constant, or a call chain is left bare.
 */
export function shouldAwaitCall(opts: {
  receiver: PrismNode | null | undefined;
  jsName: string;
  inAsyncMethod: boolean;
  asyncMethods: ReadonlySet<string>;
}): boolean {
  if (!opts.inAsyncMethod || !opts.asyncMethods.has(opts.jsName)) return false;
  return !opts.receiver || opts.receiver.constructor?.name === "SelfNode";
}
