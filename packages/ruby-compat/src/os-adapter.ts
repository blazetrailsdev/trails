export interface OsAdapter {
  tmpdir(): string;
  platform(): string;
  cwd(): string;
  availableParallelism(): number;
}

const registry = new Map<string, OsAdapter>();
let currentAdapterName: string | null = null;
let resolved: OsAdapter | null = null;

/** @noRailsEquivalent PERMANENT */
export function registerOsAdapter(name: string, adapter: OsAdapter): void {
  registry.set(name, adapter);
  if (name === currentAdapterName) resolved = null;
}

let nodeAttempted = false;

/** @noRailsEquivalent PERMANENT */
interface NodeProcess {
  versions?: { node?: string };
  getBuiltinModule?(id: string): unknown;
}

function nodeProcess(): NodeProcess | undefined {
  return (globalThis as { process?: NodeProcess }).process;
}

/** @noRailsEquivalent PERMANENT */
declare const require: ((id: string) => unknown) | undefined;

function syncBuiltinLoader(): ((id: string) => unknown) | null {
  const proc = nodeProcess();
  const getBuiltinModule = proc?.getBuiltinModule;
  if (typeof getBuiltinModule === "function") return (id) => getBuiltinModule.call(proc, id);
  if (typeof require === "undefined") return null;
  const nodeModule = require("node:module") as {
    createRequire(p: string): (id: string) => unknown;
  };
  return nodeModule.createRequire("file:///ruby-compat");
}

type NodeOs = {
  tmpdir: () => string;
  platform: () => string;
  availableParallelism: () => number;
};

function wrap(os: NodeOs): OsAdapter {
  return {
    tmpdir: () => os.tmpdir(),
    platform: () => os.platform(),
    cwd: () => {
      const proc = (globalThis as { process?: { cwd?: () => string } }).process;
      if (proc && typeof proc.cwd === "function") return proc.cwd();
      throw new Error("process.cwd() is unavailable in this runtime");
    },
    availableParallelism: () => os.availableParallelism(),
  };
}

function tryAutoRegisterNode(): boolean {
  if (registry.has("node")) return true;
  if (nodeAttempted) return false;
  nodeAttempted = true;
  try {
    const proc = nodeProcess();
    if (proc === undefined || !proc.versions?.node) {
      return false;
    }
    const req = syncBuiltinLoader();
    if (!req) return false;
    registry.set("node", wrap(req("node:os") as NodeOs));
    return true;
  } catch {
    return false;
  }
}

function resolve(): OsAdapter {
  if (resolved) return resolved;
  const name = currentAdapterName;
  if (name) {
    const reg = registry.get(name);
    if (!reg) throw new Error(`OS adapter "${name}" is not registered.`);
    resolved = reg;
    return reg;
  }
  if (tryAutoRegisterNode()) {
    resolved = registry.get("node")!;
    return resolved;
  }
  throw new Error(
    "No OS adapter configured. Under ESM, import '@blazetrails/activesupport/node' from your entry point; otherwise set ActiveSupport.osAdapter or register a custom adapter.",
  );
}

/** @noRailsEquivalent PERMANENT */
export function getOs(): OsAdapter {
  return resolve();
}

/** @noRailsEquivalent PERMANENT */
export async function getOsAsync(): Promise<OsAdapter> {
  return resolve();
}

/** @noRailsEquivalent PERMANENT */
export const osAdapterConfig = {
  /** @noRailsEquivalent PERMANENT */
  get adapter(): string | null {
    return currentAdapterName;
  },
  /** @noRailsEquivalent PERMANENT */
  set adapter(name: string | null) {
    currentAdapterName = name;
    resolved = null;
  },
};
