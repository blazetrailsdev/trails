/**
 * TS language service plugin — Phase 2c-b (plan §2.4). Registered in
 * a host project's `tsconfig.json` under `compilerOptions.plugins` as
 * `{ "name": "@blazetrails/trails-tsc/lsp" }`. Virtualizes `.tse`
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
  const inferKindFromExt = (p: string): ts.ScriptKind => {
    const e = p.slice(p.lastIndexOf(".")).toLowerCase();
    return e === ".ts"
      ? tsLib.ScriptKind.TS
      : e === ".tsx"
        ? tsLib.ScriptKind.TSX
        : e === ".js"
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

      host.readFile = (p, enc) => {
        const raw = origReadFile?.(p, enc);
        return p.endsWith(".tse") && typeof raw === "string" ? virtualize(raw) : raw;
      };

      host.getScriptSnapshot = (p) => {
        if (!p.endsWith(".tse")) return origGetSnapshot(p);
        let raw: string | undefined = origReadFile?.(p, "utf8");
        if (raw === undefined) {
          try {
            raw = fs.readFileSync(p, "utf8");
          } catch {
            /* file absent */
          }
        }
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
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTseFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".tse")) out.push(full);
  }
  return out;
}

export default init;
