// Pluggable package-manager adapter. Mirrors the activesupport
// child-process / fs adapter pattern: a registry of named implementations
// plus a default-detection path that picks one based on lock-file presence.
//
// Why pluggable: trails apps may use pnpm, npm, yarn, or bun. Hardcoding
// any single one in generator code locks users out of the others. Adapter
// at the boundary, hardcoded only at registration time.

import { getChildProcess, getFs, getPath } from "@blazetrails/activesupport";

export interface PackageManagerAdapter {
  /** CLI binary name (`pnpm`, `npm`, `yarn`, `bun`). */
  name: string;
  /** Argv for `<name> install` — the trails equivalent of `bundle install`. */
  installArgs: string[];
  /** Argv prefix for adding a dependency, e.g. `["add"]` or `["install"]`. */
  addArgs: string[];
  /** Argv prefix for running a package.json script. */
  runArgs: string[];
}

const registry = new Map<string, PackageManagerAdapter>();
let currentAdapterName: string | null = null;

export function registerPackageManagerAdapter(adapter: PackageManagerAdapter): void {
  registry.set(adapter.name, adapter);
}

// Built-in adapters. These are pure data; they don't import anything.
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

/**
 * Detect the active package manager from lock-file presence in `cwd`.
 *
 * Order: pnpm → yarn → bun → npm. Mirrors how the JS ecosystem itself
 * resolves conflicts when multiple lockfiles exist (pnpm wins because
 * its lockfile is the most-recent convention and the most authoritative
 * about hoisting). Falls back to `npm` since every Node install ships it.
 */
export interface DetectOptions {
  /** Adapter name to return when no lockfile is found. Defaults to `npm`. */
  fallback?: string;
}

export function detectPackageManager(cwd: string, opts: DetectOptions = {}): PackageManagerAdapter {
  const fs = getFs();
  const path = getPath();
  if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) return registry.get("pnpm")!;
  if (fs.existsSync(path.join(cwd, "yarn.lock"))) return registry.get("yarn")!;
  if (fs.existsSync(path.join(cwd, "bun.lockb"))) return registry.get("bun")!;
  const fallback = opts.fallback ?? "npm";
  const adapter = registry.get(fallback);
  if (!adapter) throw new Error(`Package manager "${fallback}" is not registered.`);
  return adapter;
}

/**
 * Resolve the active package manager. Honors an explicit
 * `packageManagerAdapterConfig.adapter` override; otherwise auto-detects
 * from `cwd` (with optional `fallback`).
 */
export function getPackageManager(cwd: string, opts: DetectOptions = {}): PackageManagerAdapter {
  if (currentAdapterName) {
    const adapter = registry.get(currentAdapterName);
    if (!adapter) throw new Error(`Package manager "${currentAdapterName}" is not registered.`);
    return adapter;
  }
  return detectPackageManager(cwd, opts);
}

/**
 * Run a package manager's install command in `cwd`. If `pm` is omitted,
 * resolves via {@link getPackageManager}.
 */
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
