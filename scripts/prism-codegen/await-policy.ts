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

/**
 * Emit one arm of a branching construct against a private copy of the binding
 * set, and hand back both the emitted value and the bindings the arm ended
 * with. The caller's set is left exactly as it was, so sibling arms all start
 * from the same state and nothing an arm did escapes until
 * {@link mergeAsyncArms} decides what survives.
 */
export function scopeAsyncArm<T>(
  bindings: Set<string>,
  emit: () => T,
): { value: T; after: Set<string> } {
  const before = new Set(bindings);
  const value = emit();
  const after = new Set(bindings);
  bindings.clear();
  for (const key of before) bindings.add(key);
  return { value, after };
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
 */
export function mergeAsyncArms(
  bindings: Set<string>,
  arms: ReadonlyArray<ReadonlySet<string>>,
  exhaustive: boolean,
): void {
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
 * A bare, paren-less, argument-less implicit self-call is excluded: the
 * emitter renders it as a property access rather than a call, so the target
 * holds a method reference, not the method's resolved value.
 */
export function hasAsyncProvenance(
  value: PrismNode | null | undefined,
  jsNameOf: (rubyName: string) => string,
  asyncMethods: ReadonlySet<string>,
): boolean {
  if (!value || value.constructor?.name !== "CallNode") return false;
  const receiver = value.receiver as PrismNode | null;
  if (receiver && receiver.constructor?.name !== "SelfNode") return false;
  const invoked =
    receiver != null || value.openingLoc != null || value.arguments_ != null || value.block != null;
  if (!invoked) return false;
  return asyncMethods.has(jsNameOf(String(value.name)));
}
