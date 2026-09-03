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
  const viewsRootByCwd = new Map<string, string>();

  const virtualize = (content: string): string => {
    try {
      return virtualizeTse(content);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `const __tseFailure: never = ${JSON.stringify(msg)}; export default __tseFailure;\n`;
    }
  };

  const inferKindFromExt = (p: string): ts.ScriptKind => {
    const lower = p.toLowerCase();
    if (lower.endsWith(".d.ts") || lower.endsWith(".d.mts") || lower.endsWith(".d.cts"))
      return tsLib.ScriptKind.TS;
    const dot = lower.lastIndexOf(".");
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

      const readTseSource = (p: string, enc?: string): string | undefined => {
        const raw = origReadFile?.(p, enc);
        if (typeof raw === "string") return raw;
        try {
          return fs.readFileSync(p, "utf8");
        } catch {
          return undefined;
        }
      };

      if (origReadFile) {
        host.readFile = (p, enc) => {
          if (!p.endsWith(".tse")) return origReadFile(p, enc);
          const raw = readTseSource(p, enc);
          return raw === undefined ? undefined : virtualize(raw);
        };
      }

      host.getScriptSnapshot = (p) => {
        if (!p.endsWith(".tse")) return origGetSnapshot(p);
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
  return out.sort();
}

export default init;
