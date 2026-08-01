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
 * an explicit `self.`, or a receiver whose async provenance was established
 * inside the enclosing def (see {@link asyncBindingKey}). Anything else — a
 * param, a constant, a call chain, an ivar of unknown origin — is left bare.
 */
export function shouldAwaitCall(opts: {
  receiver: PrismNode | null | undefined;
  jsName: string;
  inAsyncMethod: boolean;
  asyncMethods: ReadonlySet<string>;
  asyncBindings?: ReadonlySet<string>;
}): boolean {
  if (!opts.inAsyncMethod || !opts.asyncMethods.has(opts.jsName)) return false;
  if (!opts.receiver || opts.receiver.constructor?.name === "SelfNode") return true;
  const key = asyncBindingKey(opts.receiver);
  return key != null && (opts.asyncBindings?.has(key) ?? false);
}

/**
 * The provenance-tracking key for a variable read or write: `@name` for an
 * instance variable, `name` for a local. Anything else has no key, so it can
 * neither record nor claim local async provenance.
 *
 * Provenance is recorded per write and retracted by a later write whose value
 * has none: after `@rel = arg` the receiver is unpinned again, so awaiting its
 * calls would be a guess.
 */
export function asyncBindingKey(node: PrismNode | null | undefined): string | null {
  const kind = node?.constructor?.name;
  if (!node || !kind) return null;
  if (kind.startsWith("InstanceVariable")) return `@${String(node.name)}`;
  if (kind.startsWith("LocalVariable")) return String(node.name);
  return null;
}

/**
 * Drop the write target's async provenance, recursing into the nested targets
 * of a destructuring write. Every rebind that does not itself establish
 * provenance has to go through here.
 */
export function clearAsyncProvenance(
  target: PrismNode | null | undefined,
  bindings: Set<string>,
): void {
  if (!target) return;
  const key = asyncBindingKey(target);
  if (key) {
    bindings.delete(key);
    return;
  }
  if (target.constructor?.name !== "MultiTargetNode") return;
  for (const nested of [
    ...((target.lefts as PrismNode[]) ?? []),
    ...((target.rights as PrismNode[]) ?? []),
    (target.rest as PrismNode | null) ?? null,
  ]) {
    clearAsyncProvenance(nested, bindings);
  }
}

export interface AsyncArm<T = unknown> {
  value: T;
  after: Set<string>;
  terminal: boolean;
}

/**
 * Emit one arm of a branching construct against a private copy of the binding
 * set, and hand back both the emitted value and the bindings the arm ended
 * with. The caller's set is left exactly as it was, so sibling arms all start
 * from the same state and nothing an arm did escapes until
 * {@link mergeAsyncArms} decides what survives.
 *
 * `body` is the arm's Ruby body, used to decide whether the arm can fall
 * through into the code after the construct. Omit it for an arm that always
 * can — a loop body reaches past the loop even when it ends in `break`.
 * `inLoop` is the emitter's loop state at the arm, which decides whether a
 * trailing `next`/`break` is emitted as real control flow.
 */
export function scopeAsyncArm<T>(
  bindings: Set<string>,
  emit: () => T,
  body?: PrismNode | null,
  inLoop = false,
): AsyncArm<T> {
  const before = new Set(bindings);
  const value = emit();
  const after = new Set(bindings);
  bindings.clear();
  for (const key of before) bindings.add(key);
  return { value, after, terminal: !fallsThrough(body, inLoop) };
}

/**
 * Whether control can reach the statement after `node`, judged by what the
 * emitter actually produces rather than by Ruby semantics: a `raise`,
 * `next`, or `break` the handlers decline to convert is emitted as a plain
 * expression and does reach the next statement, so treating it as terminal
 * would drop a live retraction and award a false-positive await.
 *
 * `break`/`next` are terminal relative to the enclosing branch only; a loop
 * body is never handed to this function, since a body ending in `break` does
 * reach the code after the loop.
 */
export function fallsThrough(node: PrismNode | null | undefined, inLoop = false): boolean {
  const kind = node?.constructor?.name;
  if (!node || !kind) return true;
  if (kind === "StatementsNode") {
    const kids = node.compactChildNodes();
    return kids.length === 0 || fallsThrough(kids[kids.length - 1], inLoop);
  }
  if (kind === "ReturnNode") return false;
  if (kind === "NextNode") return inLoop && argumentCount(node) > 0;
  if (kind === "BreakNode") return !inLoop || argumentCount(node) > 0;
  if (kind === "CallNode") return !isRaiseThrow(node);
  if (kind === "IfNode" || kind === "UnlessNode") {
    const sub = (node.subsequent ?? node.elseClause) as PrismNode | null;
    if (!sub) return true;
    const elseBody = sub.constructor.name === "ElseNode" ? (sub.statements as PrismNode) : sub;
    return (
      fallsThrough(node.statements as PrismNode | null, inLoop) || fallsThrough(elseBody, inLoop)
    );
  }
  return true;
}

/**
 * Whether a call is a `raise` the emitter renders as a `throw`. Any other
 * shape — a bare re-raise, a `raise` with a block, a multi-argument `raise`
 * whose head is not a constant — is emitted as an ordinary call, so it must
 * not be read as terminating control flow.
 */
export function isRaiseThrow(node: PrismNode): boolean {
  if (node.constructor?.name !== "CallNode") return false;
  if (String(node.name) !== "raise" || node.receiver || node.block) return false;
  const args = raiseArguments(node);
  if (args.length === 0) return false;
  if (args.length === 1) return true;
  const head = args[0].constructor.name;
  return head === "ConstantReadNode" || head === "ConstantPathNode";
}

export function raiseArguments(node: PrismNode): PrismNode[] {
  return ((node.arguments_ as PrismNode | null)?.arguments_ as PrismNode[]) ?? [];
}

function argumentCount(node: PrismNode): number {
  return raiseArguments(node).length;
}

/**
 * Fold the arms of a branch back into the enclosing binding set.
 *
 * Provenance established inside an arm only survives when the branch is
 * exhaustive — an `if`/`else`, a `case` with an `else`, or a construct whose
 * single arm is the only route past it, like a `begin`/`ensure` with no
 * `rescue` — and every arm establishes it — otherwise the code after the construct may have run a path
 * that never assigned, and awaiting there is the false positive the policy
 * exists to avoid. Retraction is the safe direction, so it stays eager: a key
 * dropped by any arm is dropped outright, exhaustive or not.
 *
 * Arms that cannot fall through are excluded from both directions: they are
 * not paths into the code after the construct, so neither what they establish
 * nor what they retract says anything about it. A branch whose every arm is
 * terminal therefore leaves the enclosing bindings exactly as they were.
 */
export function mergeAsyncArms(
  bindings: Set<string>,
  allArms: ReadonlyArray<{ after: ReadonlySet<string>; terminal?: boolean }>,
  exhaustive: boolean,
): void {
  const arms = allArms.filter((arm) => !arm.terminal).map((arm) => arm.after);
  for (const key of [...bindings]) {
    if (arms.some((arm) => !arm.has(key))) bindings.delete(key);
  }
  if (!exhaustive || arms.length === 0) return;
  for (const key of arms[0]) {
    if (arms.every((arm) => arm.has(key))) bindings.add(key);
  }
}

/**
 * Whether an assigned value pins the target's type down well enough to award
 * awaits on its later use: a self-call (implicit, or explicit `self.`) naming
 * a method the async manifest resolves. The receiver of such a call is fixed
 * by the AST, so unlike a bare name the manifest lookup cannot land on an
 * unrelated same-named method.
 *
 * A paren-less, argument-less implicit self-call counts only when the port
 * index says the name is a method, since that is exactly when the emitter
 * renders it as a call. Without that, the target holds a method reference
 * rather than the method's resolved value, and awaiting its later calls would
 * be awaiting the wrong thing.
 */
export function hasAsyncProvenance(
  value: PrismNode | null | undefined,
  jsNameOf: (rubyName: string) => string,
  asyncMethods: ReadonlySet<string>,
  portMethods: ReadonlySet<string> = new Set(),
): boolean {
  if (!value || value.constructor?.name !== "CallNode") return false;
  const receiver = value.receiver as PrismNode | null;
  if (receiver && receiver.constructor?.name !== "SelfNode") return false;
  const jsName = jsNameOf(String(value.name));
  const invoked =
    receiver != null ||
    value.openingLoc != null ||
    value.arguments_ != null ||
    value.block != null ||
    portMethods.has(jsName);
  if (!invoked) return false;
  return asyncMethods.has(jsName);
}
