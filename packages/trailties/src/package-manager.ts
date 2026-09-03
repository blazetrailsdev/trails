import { getChildProcess } from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat";

export interface PackageManagerAdapter {
  name: string;
  installArgs: string[];
  addArgs: string[];
  runArgs: string[];
}

const registry = new Map<string, PackageManagerAdapter>();
let currentAdapterName: string | null = null;

export function registerPackageManagerAdapter(adapter: PackageManagerAdapter): void {
  registry.set(adapter.name, adapter);
}

registerPackageManagerAdapter({
  name: "pnpm",
  installArgs: ["install"],
  addArgs: ["add"],
  runArgs: ["run"],
});
registerPackageManagerAdapter({
  name: "npm",
  installArgs: ["install"],
  addArgs: ["install"],
  runArgs: ["run"],
});
registerPackageManagerAdapter({
  name: "yarn",
  installArgs: ["install"],
  addArgs: ["add"],
  runArgs: ["run"],
});
registerPackageManagerAdapter({
  name: "bun",
  installArgs: ["install"],
  addArgs: ["add"],
  runArgs: ["run"],
});

export const packageManagerAdapterConfig = {
  get adapter(): string | null {
    return currentAdapterName;
  },
  set adapter(name: string | null) {
    currentAdapterName = name;
  },
};

export interface DetectOptions {
  fallback?: string;
}

export function detectPackageManager(cwd: string, opts: DetectOptions = {}): PackageManagerAdapter {
  if (File.isExist(File.join(cwd, "pnpm-lock.yaml"))) return registry.get("pnpm")!;
  if (File.isExist(File.join(cwd, "yarn.lock"))) return registry.get("yarn")!;
  if (File.isExist(File.join(cwd, "bun.lockb"))) return registry.get("bun")!;
  const fallback = opts.fallback ?? "npm";
  const adapter = registry.get(fallback);
  if (!adapter) throw new Error(`Package manager "${fallback}" is not registered.`);
  return adapter;
}

export function getPackageManager(cwd: string, opts: DetectOptions = {}): PackageManagerAdapter {
  if (currentAdapterName) {
    const adapter = registry.get(currentAdapterName);
    if (!adapter) throw new Error(`Package manager "${currentAdapterName}" is not registered.`);
    return adapter;
  }
  return detectPackageManager(cwd, opts);
}

export function packageManagerInstall(
  cwd: string,
  pm?: PackageManagerAdapter,
): {
  status: number | null;
  stderr: string;
} {
  const resolved = pm ?? getPackageManager(cwd);
  const result = getChildProcess().spawnSync(resolved.name, resolved.installArgs, { cwd });
  return { status: result.status, stderr: result.stderr };
}
