import type { PrismNode } from "./types.js";
import { rubyStr } from "./types.js";
import { methodName, isJsIdentName } from "./naming.js";

/** Delegated JS method name → the JS receiver it is delegated to. */
export type DelegationTable = ReadonlyMap<string, string>;

/**
 * `delegate :a, :b, to: :model` generates instance methods `a`/`b`, so a
 * receiverless call to one of them is not a self-call — it reaches through
 * `model`.
 *
 * Four kinds of macro contribute nothing to the table, because resolving their
 * calls to `this.<target>.<name>` would be wrong: `to: :class` and `to: :self`
 * (not property reaches on `this`), `prefix:` (the generated method is named
 * `<target>_<name>`, not `<name>`), macros written inside `class << self` (they
 * generate singleton methods), and any name the file also defines with `def` (a
 * real definition wins over the macro-generated one).
 */
export function collectDelegations(program: PrismNode): DelegationTable {
  const table = new Map<string, string>();
  const defined = new Set<string>();
  walk(program, table, defined, false);
  for (const name of defined) table.delete(name);
  return table;
}

/** Merge tables, with the file's own delegations winning over inherited ones. */
export function mergeDelegations(
  inherited: DelegationTable,
  own: DelegationTable,
): DelegationTable {
  return new Map([...inherited, ...own]);
}

function walk(
  node: PrismNode,
  table: Map<string, string>,
  defined: Set<string>,
  inSingleton: boolean,
): void {
  const kind = node.constructor?.name;
  if (kind === "DefNode") defined.add(methodName(String(node.name)));
  if (!inSingleton && kind === "CallNode" && String(node.name) === "delegate" && !node.receiver) {
    record(node, table);
  }
  const singletonBelow = inSingleton || kind === "SingletonClassNode";
  for (const child of node.compactChildNodes()) walk(child, table, defined, singletonBelow);
}

function record(call: PrismNode, table: Map<string, string>): void {
  const args = ((call.arguments_ as PrismNode | null)?.arguments_ as PrismNode[]) ?? [];
  if (args.length < 2) return;
  const target = delegationTarget(args[args.length - 1]);
  if (!target) return;
  for (const arg of args.slice(0, -1)) {
    if (arg.constructor?.name !== "SymbolNode") return;
    const name = methodName(rubyStr(arg.unescaped));
    if (isJsIdentName(name)) table.set(name, target);
  }
}

function delegationTarget(node: PrismNode): string | undefined {
  if (node.constructor?.name !== "KeywordHashNode") return undefined;
  let target: string | undefined;
  for (const assoc of (node.elements as PrismNode[]) ?? []) {
    const key = assoc.key as PrismNode | undefined;
    const value = assoc.value as PrismNode | undefined;
    if (key?.constructor?.name !== "SymbolNode") return undefined;
    const option = rubyStr(key.unescaped);
    if (option === "prefix") return undefined;
    if (option !== "to") continue;
    if (value?.constructor?.name !== "SymbolNode") return undefined;
    const raw = rubyStr(value.unescaped);
    if (raw === "class" || raw === "self") return undefined;
    const name = methodName(raw);
    if (!isJsIdentName(name)) return undefined;
    target = name;
  }
  return target;
}
