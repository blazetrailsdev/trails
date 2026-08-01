import type { PrismNode } from "./types.js";

/**
 * The async manifest resolves names, not methods: two Rails files can define
 * the same `def`, and a call like `ids.first` or `record.update` names an
 * async port method while targeting something else entirely. Awaiting those is
 * a no-op today only because the generated output is never executed — once it
 * is applied, an await in a sync path is a behavioural change. So the await
 * rule is narrowed to the receivers whose identity the AST actually pins down:
 * an implicit self-call, or an explicit `self.`. Anything reached through a
 * local, a param, an ivar, a constant, or a chain is left bare.
 */
export type AwaitReceiver = "self" | "other";

export function awaitReceiverKind(receiver: PrismNode | null | undefined): AwaitReceiver {
  if (!receiver) return "self";
  return receiver.constructor?.name === "SelfNode" ? "self" : "other";
}

export function shouldAwaitCall(opts: {
  receiver: PrismNode | null | undefined;
  jsName: string;
  inAsyncMethod: boolean;
  asyncMethods: ReadonlySet<string>;
}): boolean {
  if (!opts.inAsyncMethod) return false;
  if (!opts.asyncMethods.has(opts.jsName)) return false;
  return awaitReceiverKind(opts.receiver) === "self";
}
