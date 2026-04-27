#!/usr/bin/env -S npx tsx
/**
 * Stubs out missing private methods in existing activerecord TS files.
 * For each method reported by `api:compare` as missing, appends a non-exported
 * function with the same parameter names as the Rails source. Body throws
 * NotImplementedError.
 *
 * These stubs are intentionally *not* counted by `extract-ts-api` (which
 * skips file-local helpers whose body is just `throw new NotImplementedError`)
 * — they are a navigational aid, not API coverage, and should not inflate
 * the privates score.
 *
 * Idempotent: each file's generated block lives between marker comments. On
 * re-run the existing block is removed before a fresh one is appended, so a
 * file never accumulates multiple generated sections.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const PKG_SRC = path.join(ROOT, "packages/activerecord/src");

type RubyParam = { name: string; kind: string };
type RubyMethod = { name: string; params: RubyParam[]; visibility?: string };
type RubyClass = {
  fqn: string;
  file: string;
  instanceMethods?: RubyMethod[];
  classMethods?: RubyMethod[];
};

const privates = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "scripts/api-compare/output/api-comparison-privates-only.json"),
    "utf8",
  ),
);
const railsApi = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts/api-compare/output/rails-api.json"), "utf8"),
);

const ar = privates.results.find((r: any) => r.package === "activerecord");
if (!ar) throw new Error("no activerecord results");

// Build lookup: fqn -> name -> params
const arRails = railsApi.packages.activerecord;
const methodsByFqn = new Map<string, Map<string, RubyParam[]>>();
for (const c of [
  ...Object.values(arRails.classes || {}),
  ...Object.values(arRails.modules || {}),
] as RubyClass[]) {
  const m = new Map<string, RubyParam[]>();
  for (const meth of [...(c.instanceMethods || []), ...(c.classMethods || [])]) {
    if (!m.has(meth.name)) m.set(meth.name, meth.params || []);
  }
  methodsByFqn.set(c.fqn, m);
}

const RESERVED = new Set([
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
  "let",
  "static",
  "implements",
  "interface",
  "package",
  "private",
  "protected",
  "public",
  "arguments",
  "eval",
]);

function snakeToCamel(name: string): string {
  return name.replace(/_([a-zA-Z0-9])/g, (_m, c) => c.toUpperCase());
}

function safeIdent(raw: string, fallback: string): string {
  if (!raw || raw === "*" || raw === "**" || raw === "&") return fallback;
  let id = snakeToCamel(raw.replace(/^[*&]+/, ""));
  if (!/^[A-Za-z_$][\w$]*$/.test(id)) id = fallback;
  if (RESERVED.has(id)) id = id + "_";
  return id;
}

function paramList(params: RubyParam[]): string {
  const out: string[] = [];
  // Only emit a real `...rest` if the rest param is the last in the list;
  // otherwise demote to `name?: any[]` so TS rules (rest must be last) hold.
  const trailingRestIdx =
    params.length > 0 && params[params.length - 1].kind === "rest" ? params.length - 1 : -1;
  let restSeen = false;
  let i = 0;
  for (const p of params) {
    i++;
    const fb = `arg${i}`;
    switch (p.kind) {
      case "required": {
        const id = safeIdent(p.name, fb);
        out.push(`${id}: any`);
        break;
      }
      case "optional": {
        const id = safeIdent(p.name, fb);
        out.push(`${id}?: any`);
        break;
      }
      case "rest": {
        const id = safeIdent(p.name, "args");
        const idx = i - 1;
        if (idx === trailingRestIdx && !restSeen) {
          out.push(`...${id}: any[]`);
          restSeen = true;
        } else {
          out.push(`${id}?: any[]`);
        }
        break;
      }
      case "keyword": {
        const id = safeIdent(p.name, `opt${i}`);
        out.push(`${id}?: any`);
        break;
      }
      case "keyword_rest": {
        const id = safeIdent(p.name, "opts");
        out.push(`${id}?: any`);
        break;
      }
      case "block": {
        const id = safeIdent(p.name, "block");
        out.push(`${id}?: any`);
        break;
      }
    }
  }
  return out.join(", ");
}

let totalAppended = 0;
let filesTouched = 0;

for (const fileEntry of ar.files) {
  if (!fileEntry.tsFileExists) continue;
  if (!fileEntry.missingMethods?.length) continue;

  const tsRel = fileEntry.expectedTsFile as string;
  const tsAbs = path.join(PKG_SRC, tsRel);
  if (!fs.existsSync(tsAbs)) continue;

  let src = fs.readFileSync(tsAbs, "utf8");

  // Strip any trailing run of previously-generated stubs so re-runs replace
  // them instead of stacking new ones. A stub is identified structurally:
  // a non-exported `function NAME(...): never { throw new NotImplementedError("..."); }`
  // (matching what this script emits below).
  const trailingStubRe =
    /(?:\s*function\s+[A-Za-z_$][\w$]*\s*\([^)]*\)\s*:\s*never\s*\{\s*throw\s+new\s+NotImplementedError\("[^"]*"\);\s*\})+\s*$/;
  src = src.replace(trailingStubRe, "\n");

  // Determine import for NotImplementedError. The errors module lives at
  // packages/activerecord/src/errors.ts. Compute relative import.
  const fromDir = path.dirname(tsAbs);
  let relImport = path.relative(fromDir, path.join(PKG_SRC, "errors")).replaceAll("\\", "/");
  if (!relImport.startsWith(".")) relImport = "./" + relImport;
  const importSpec = relImport + ".js";

  // Match an existing import from the *same module specifier* so we can merge
  // NotImplementedError into it instead of adding a duplicate `import` line.
  const escapedSpec = importSpec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sameModuleImportRe = new RegExp(
    `^([ \\t]*import\\s+(?:type\\s+)?\\{)([^}]*)(\\}\\s+from\\s+["']${escapedSpec}["'][^\\n]*)$`,
    "m",
  );
  const sameModuleMatch = sameModuleImportRe.exec(src);
  const alreadyImported =
    sameModuleMatch !== null && /\bNotImplementedError\b/.test(sameModuleMatch[2]);

  const stubs: string[] = [];
  const usedNames = new Set<string>();
  // Avoid clashing with anything already in the file. Simple regex check.
  const existingTopLevel = new Set<string>();
  for (const m of src.matchAll(/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) {
    existingTopLevel.add(m[1]);
  }
  for (const m of src.matchAll(/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) {
    existingTopLevel.add(m[1]);
  }
  for (const m of src.matchAll(/^\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/gm)) {
    existingTopLevel.add(m[1]);
  }
  // Imports — capture all named bindings and default/namespace.
  for (const im of src.matchAll(
    /^\s*import\s+(?:type\s+)?(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]+)\})?\s*(?:from)?/gm,
  )) {
    if (im[1]) existingTopLevel.add(im[1]);
    if (im[2]) {
      for (const part of im[2].split(",")) {
        const t = part.trim().split(/\s+as\s+/);
        const name = (t[1] || t[0]).trim();
        if (name) existingTopLevel.add(name);
      }
    }
  }

  for (const mm of fileEntry.missingMethods) {
    const tsName = mm.tsName as string;
    if (existingTopLevel.has(tsName)) continue;
    if (usedNames.has(tsName)) continue;
    usedNames.add(tsName);
    const params = methodsByFqn.get(mm.rubyModule)?.get(mm.rubyName) || [];
    const sig = paramList(params);
    stubs.push(
      `function ${tsName}(${sig}): never {\n` +
        `  throw new NotImplementedError("${mm.rubyModule}#${mm.rubyName} is not implemented");\n` +
        `}`,
    );
  }

  if (stubs.length === 0) continue;

  if (!alreadyImported) {
    if (sameModuleMatch) {
      // Merge into the existing import-from-errors line.
      const [whole, head, names, tail] = sameModuleMatch;
      const merged = `${head}${names.replace(/[\s,]*$/, "")}, NotImplementedError ${tail}`;
      src = src.replace(whole, merged);
    } else {
      // Insert after any leading block-comment / line-comment header so we
      // don't push module-level JSDoc off the first line.
      // Consume any trailing whitespace/newlines after `*/` so the inserted
      // import lands on its own line, not adjacent to the closing comment.
      const headerRe = /^(\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)+)/;
      const headerMatch = headerRe.exec(src);
      const importLine = `import { NotImplementedError } from "${importSpec}";\n`;
      if (headerMatch) {
        const idx = headerMatch[0].length;
        src = src.slice(0, idx) + importLine + src.slice(idx);
      } else {
        src = importLine + src;
      }
    }
  }

  if (!src.endsWith("\n")) src += "\n";
  src += "\n" + stubs.join("\n\n") + "\n";

  fs.writeFileSync(tsAbs, src);
  totalAppended += stubs.length;
  filesTouched++;
}

console.log(`Appended ${totalAppended} stubs across ${filesTouched} files.`);
