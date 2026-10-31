export interface ReplServerLike {
  context: Record<string, unknown>;
  on(event: "exit", listener: () => void): unknown;
}

export interface ReplAdapter {
  start(options: { prompt: string; useGlobal: boolean }): ReplServerLike;
}

const registry = new Map<string, ReplAdapter>();

export const replAdapterConfig: { adapter: string } = { adapter: "node" };

/** @noRailsEquivalent PERMANENT */
export function registerReplAdapter(name: string, adapter: ReplAdapter): void {
  registry.set(name, adapter);
}

/** @noRailsEquivalent PERMANENT */
export async function getReplAsync(): Promise<ReplAdapter> {
  const name = replAdapterConfig.adapter;
  if (!registry.has(name) && name === "node") {
    const proc = (globalThis as { process?: { getBuiltinModule?(id: string): unknown } }).process;
    const repl = proc?.getBuiltinModule?.("node:repl");
    if (repl != null) registry.set("node", repl as ReplAdapter);
  }
  const adapter = registry.get(name);
  if (adapter == null) throw new Error(`No REPL adapter registered as ${name}`);
  return adapter;
}
