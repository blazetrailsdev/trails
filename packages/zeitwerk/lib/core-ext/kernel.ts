import {
  Kernel,
  LOADED_FEATURES,
  NotImplementedError,
  getAsyncContext,
  getPath,
  getProcessAdapter,
  type AsyncContext,
} from "@blazetrails/ruby-compat";
import type { Cref } from "../cref.js";
import { Registry } from "../registry.js";

/** @noRailsEquivalent PERMANENT */
const _requiring = new Map<string, { cpath: string; load: Promise<void> }>();

/** @noRailsEquivalent PERMANENT */
let _heldConstants: AsyncContext<string[]> | null = null;

/** @noRailsEquivalent PERMANENT */
let _resolveHookInstalled = false;

/** @noRailsEquivalent PERMANENT */
export const _generations = new Map<string, number>();

export function _installResolveHook(): void {
  if (_resolveHookInstalled) return;

  const adapter = getProcessAdapter();
  if (adapter.registerHooks === undefined) {
    throw new NotImplementedError("registerHooks() function is unimplemented on this machine");
  }
  _resolveHookInstalled = true;

  adapter.registerHooks({
    resolve(specifier, context, nextResolve) {
      const resolved = nextResolve(specifier, context);
      if (!resolved.url.startsWith("file:")) return resolved;

      const url = new URL(resolved.url);
      const path = getPath().fileURLToPath!(resolved.url);
      for (const loader of Registry.loaders) {
        if (loader._generation === 1) continue;
        for (const [realRoot, rootDir] of Object.entries(loader._realRoots)) {
          if (!path.startsWith(`${realRoot}${getPath().sep}`)) continue;
          if (loader.isIgnores(rootDir + path.slice(realRoot.length))) continue;
          if (!/\.[jt]s$/.test(path) || /\.d\.ts$|\.test\.[jt]s$/.test(path)) continue;
          const segments = path.slice(realRoot.length + 1).split(getPath().sep);
          if (segments.some((segment) => loader.isHidden(segment))) continue;
          url.searchParams.set("zeitwerk", String(loader._generation));
          return { ...resolved, url: url.href };
        }
      }
      return resolved;
    },
  });
}

/** @noRailsEquivalent PERMANENT */
function _held(): AsyncContext<string[]> {
  return (_heldConstants ??= getAsyncContext().create<string[]>());
}

/** @noRailsEquivalent PERMANENT */
function _loadingConstant(cpath: string): Promise<void> | undefined {
  if (_held().getStore()?.includes(cpath)) return undefined;
  for (const requiring of _requiring.values()) {
    if (requiring.cpath === cpath) return requiring.load;
  }
  return undefined;
}

export async function require(path: string): Promise<boolean> {
  const loader = Registry.loaderFor(path);
  if (loader == null) return false;

  const ruby = await loader.isRuby(path);
  if (_requiring.has(path)) return !ruby;
  if (!Object.hasOwn(loader.autoloads, path)) {
    if (ruby) return false;
    await loader.__onDirAutoloaded(path);
    return true;
  }

  const cpath = loader.autoloads[path].path();
  const held = _held();
  const load = held.run([...(held.getStore() ?? []), cpath], async () => {
    if (ruby) {
      const thunk =
        loader._generation === 1 ? loader.imports?.[loader.autoloads[path].path()] : undefined;
      const url = getPath().pathToFileURL!(path);
      if (loader._generation > 1) url.searchParams.set("zeitwerk", String(loader._generation));
      let exports: Record<string, unknown>;
      if (thunk !== undefined) exports = (await thunk()) as Record<string, unknown>;
      else if (loader.importer !== null)
        exports = (await loader.importer(url.href)) as Record<string, unknown>;
      else exports = (await import(url.href)) as Record<string, unknown>;
      LOADED_FEATURES.push(path);
      await loader.__onFileAutoloaded(path, exports);
    } else {
      await loader.__onDirAutoloaded(path);
    }
  });
  _requiring.set(path, { cpath, load });
  try {
    await load;
  } finally {
    _requiring.delete(path);
  }
  return true;
}

/** @noRailsEquivalent PERMANENT */
export async function autoloadGet(cref: Cref): Promise<unknown> {
  for (;;) {
    const loading = _loadingConstant(cref.path());
    if (loading !== undefined) {
      await loading.catch(() => undefined);
      continue;
    }
    const autoloadPath = cref.isAutoload();
    if (autoloadPath == null) break;
    await require(autoloadPath);
    if (_loadingConstant(cref.path()) === undefined) break;
  }
  return cref.get();
}

declare module "@blazetrails/ruby-compat" {
  interface KernelModule {
    zeitwerkOriginalRequire?: KernelModule["require"];
  }
}

export const zeitwerkOriginalRequire = Kernel.require;
Kernel.zeitwerkOriginalRequire = zeitwerkOriginalRequire;

/** @missingRailsCall __on_file_autoloaded — CONVERGEABLE zeitwerk-kernel-require-load-path-feature-arm */
Kernel.require = async function (path: string): Promise<boolean> {
  const loader = Registry.loaderFor(path);
  if (loader != null) {
    return require(path);
  } else {
    return zeitwerkOriginalRequire(path);
  }
};
