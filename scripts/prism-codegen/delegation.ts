import type { PrismNode } from "./types.js";
import { rubyStr } from "./types.js";
import { methodName, isJsIdentName } from "./naming.js";

/** Delegated JS method name → the JS receiver it is delegated to. */
export type DelegationTable = ReadonlyMap<string, string>;

/**
 * `delegate :a, :b, to: :model` generates `a`/`b` on the class, so a
 * receiverless call to one of them is not a self-call — it reaches through
 * `model`. Names the file also defines with `def` are excluded: a real
 * definition wins over the macro-generated one.
 */
export function collectDelegations(program: PrismNode): DelegationTable {
  const table = new Map<string, string>();
  const defined = new Set<string>();
  walk(program, table, defined);
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

function walk(node: PrismNode, table: Map<string, string>, defined: Set<string>): void {
  const kind = node.constructor?.name;
  if (kind === "DefNode") defined.add(methodName(String(node.name)));
  if (kind === "CallNode" && String(node.name) === "delegate" && node.receiver == null) {
    record(node, table);
  }
  for (const child of node.compactChildNodes()) walk(child, table, defined);
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

/**
 * The trailing `to: :receiver` keyword. `to: :class` and `to: :self` are not
 * property reaches on `this`, so they are left out of the table entirely.
 */
function delegationTarget(node: PrismNode): string | undefined {
  if (node.constructor?.name !== "KeywordHashNode") return undefined;
  for (const assoc of (node.elements as PrismNode[]) ?? []) {
    const key = assoc.key as PrismNode | undefined;
    const value = assoc.value as PrismNode | undefined;
    if (key?.constructor?.name !== "SymbolNode" || rubyStr(key.unescaped) !== "to") continue;
    if (value?.constructor?.name !== "SymbolNode") return undefined;
    const raw = rubyStr(value.unescaped);
    if (raw === "class" || raw === "self") return undefined;
    const target = methodName(raw);
    return isJsIdentName(target) ? target : undefined;
  }
  return undefined;
}
