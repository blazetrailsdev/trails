/**
 * TS language service plugin — Phase 2c-b (plan §2.4). Registered in
 * a host project's `tsconfig.json` under `compilerOptions.plugins` as
 * `{ "name": "@blazetrails/trails-tsc/ts-plugin" }`. Virtualizes `.tse`
 * sources on the fly so tsserver type-checks them in the IDE without
 * a prebuild. The on-disk mirror is still required at runtime —
 * `trails-tsc-views dev` covers that.
 */

import type ts from "typescript";
import * as fs from "node:fs";
import * as path from "node:path";
import { virtualizeTse } from "./plugins/tse.js";

interface PluginCreateInfo {
  languageService: ts.LanguageService;
  languageServiceHost: ts.LanguageServiceHost;
  project: { getCurrentDirectory(): string };
  config: { viewsDir?: string };
}

export function init(modules: { typescript: typeof ts }): {
  create(info: PluginCreateInfo): ts.LanguageService;
  getExternalFiles(project: { getCurrentDirectory(): string }): string[];
} {
  const tsLib = modules.typescript;
  // Per-project `viewsDir` resolved from plugin config, keyed by the
  // project's current directory so multiple loaded projects don't clobber
  // each other's setting. `getExternalFiles` only receives a bare project
  // handle, so this is the only place the config can survive between calls.
  const viewsRootByCwd = new Map<string, string>();

  const virtualize = (content: string): string => {
    try {
      return virtualizeTse(content);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `const __tseFailure: never = ${JSON.stringify(msg)}; export default __tseFailure;\n`;
    }
  };

  // Mirror tsserver's filename-based dispatch for the case where the
  // host doesn't implement `getScriptKind`. Without this, our wrapper
  // would mask every non-.tse file as `Unknown` — breaking .ts/.tsx
  // diagnostics in any host that relied on TS's default inference.
  // Covers the families tsserver itself recognizes (`.d.ts`, `.mts`,
  // `.cts`, `.mjs`, `.cjs` included) so the fallback doesn't degrade
  // diagnostics for non-`.tse` files on hosts without `getScriptKind`.
  const inferKindFromExt = (p: string): ts.ScriptKind => {
    const lower = p.toLowerCase();
    if (lower.endsWith(".d.ts") || lower.endsWith(".d.mts") || lower.endsWith(".d.cts"))
      return tsLib.ScriptKind.TS;
    const dot = lower.lastIndexOf(".");
    // Extensionless paths (e.g. `README`, `tsconfig`) have no kind; default
    // to `Unknown` rather than mis-slicing the last character.
    if (dot < 0) return tsLib.ScriptKind.Unknown;
    const e = lower.slice(dot);
    return e === ".ts" || e === ".mts" || e === ".cts"
      ? tsLib.ScriptKind.TS
      : e === ".tsx"
        ? tsLib.ScriptKind.TSX
        : e === ".js" || e === ".mjs" || e === ".cjs"
          ? tsLib.ScriptKind.JS
          : e === ".jsx"
            ? tsLib.ScriptKind.JSX
            : e === ".json"
              ? tsLib.ScriptKind.JSON
              : tsLib.ScriptKind.Unknown;
  };

  return {
    create(info) {
      const cwd = info.project.getCurrentDirectory();
      viewsRootByCwd.set(cwd, path.resolve(cwd, info.config.viewsDir ?? "app/views"));
      const host = info.languageServiceHost;
      const origReadFile = host.readFile?.bind(host);
      const origGetSnapshot = host.getScriptSnapshot.bind(host);
      const origGetScriptKind = host.getScriptKind?.bind(host);

      // `readFile` is optional on `LanguageServiceHost`; when the host
      // doesn't implement it, fall through to the filesystem so `.tse`
      // content still resolves. Non-`.tse` paths pass through (returning
      // whatever the original host returned, including `undefined`).
      const readTseSource = (p: string, enc?: string): string | undefined => {
        const raw = origReadFile?.(p, enc);
        if (typeof raw === "string") return raw;
        try {
          return fs.readFileSync(p, "utf8");
        } catch {
          return undefined;
        }
      };

      // Only install the wrapper if the host had an original — otherwise
      // we'd shadow tsserver's internal filesystem fallback for plain
      // `.ts`/`.d.ts` reads by returning `undefined` for everything
      // non-`.tse`. `getScriptSnapshot` is the path that actually feeds
      // virtualized `.tse` content to the checker; `readFile` is only an
      // alternate entrypoint used by some host implementations.
      if (origReadFile) {
        host.readFile = (p, enc) => {
          if (!p.endsWith(".tse")) return origReadFile(p, enc);
          const raw = readTseSource(p, enc);
          return raw === undefined ? undefined : virtualize(raw);
        };
      }

      host.getScriptSnapshot = (p) => {
        if (!p.endsWith(".tse")) return origGetSnapshot(p);
        // Prefer the host's snapshot — in tsserver/IDE contexts it holds
        // unsaved editor buffer text, which is the source of truth. Only
        // fall back to filesystem when the host has no snapshot yet (e.g.
        // first lookup before the file is opened in the editor).
        const orig = origGetSnapshot(p);
        const raw =
          orig !== undefined ? orig.getText(0, orig.getLength()) : readTseSource(p, "utf8");
        return raw === undefined ? undefined : tsLib.ScriptSnapshot.fromString(virtualize(raw));
      };

      host.getScriptKind = (p) =>
        p.endsWith(".tse") ? tsLib.ScriptKind.TS : (origGetScriptKind?.(p) ?? inferKindFromExt(p));

      return info.languageService;
    },

    getExternalFiles(project) {
      const cwd = project.getCurrentDirectory();
      return listTseFiles(viewsRootByCwd.get(cwd) ?? path.resolve(cwd, "app/views"));
    },
  };
}

function listTseFiles(dir: string): string[] {
  // tsserver re-walks `getExternalFiles` periodically; any throw here
  // would propagate and disable the plugin. Swallow per-directory errors
  // (dir removed mid-scan, EACCES, etc.) and return a best-effort list.
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTseFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".tse")) out.push(full);
  }
  // Sort for stable order across platforms/filesystems — tsserver re-walks
  // periodically, and an order-only diff would churn the project graph.
  return out.sort();
}

export default init;
