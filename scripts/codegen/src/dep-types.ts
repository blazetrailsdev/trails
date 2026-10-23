/**
 * Facts about a dependency package's TypeScript surface, read with the
 * compiler: what the Rails manifest cannot say about the TS port (which
 * `ClassMethods` members exist, and what a member's `this` type demands of
 * the class it lands on).
 */
import ts from "typescript-5";
import { existsSync } from "node:fs";
import path from "node:path";
import { PKG_DIR } from "./gem.js";

export interface DepClassSide {
  /** `ClassMethods` member names the export carries. */
  methods: Set<string>;
  /** A static the members' `this` types require of the host → a member whose `this` type names it. */
  host: Map<string, string>;
}

const cache = new Map<string, DepClassSide | null>();
let options: ts.CompilerOptions | undefined;

function compilerOptions(): ts.CompilerOptions | undefined {
  if (options) return options;
  const tsconfig = path.join(PKG_DIR, "codegen-out", "tsconfig.json");
  if (!existsSync(tsconfig)) return undefined;
  const cfg = ts.readConfigFile(tsconfig, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, path.dirname(tsconfig));
  return (options = { ...parsed.options, noEmit: true, composite: false, incremental: false });
}

/** `spec`'s export `name` as a Concern: its `ClassMethods` and their host requirements. */
export function depClassSide(spec: string, name: string): DepClassSide | null {
  const key = `${spec}#${name}`;
  if (cache.has(key)) return cache.get(key)!;
  const opts = compilerOptions();
  if (!opts) return null;
  const probe = path.join(PKG_DIR, "codegen-out", "src", "__dep-probe.ts");
  const text = `import { ${name} as X } from ${JSON.stringify(spec)};\nexport const cm = X.ClassMethods;\n`;
  const host = ts.createCompilerHost(opts);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (f, lang, ...rest) =>
    path.resolve(f) === probe
      ? ts.createSourceFile(f, text, lang)
      : getSourceFile(f, lang, ...rest);
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (f) => path.resolve(f) === probe || fileExists(f);
  const program = ts.createProgram([probe], opts, host);
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(probe);
  const decl = sf?.statements.find(ts.isVariableStatement)?.declarationList.declarations[0];
  if (!decl) return (cache.set(key, null), null);
  const cmType = checker.getTypeAtLocation(decl.name);
  if (checker.typeToString(cmType) === "any") return (cache.set(key, null), null);
  const out: DepClassSide = { methods: new Set(), host: new Map() };
  for (const p of checker.getPropertiesOfType(cmType)) {
    out.methods.add(p.name);
    const t = checker.getTypeOfSymbolAtLocation(p, decl);
    for (const sig of t.getCallSignatures()) {
      const thisSym = sig.thisParameter;
      if (!thisSym) continue;
      const thisType = checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(thisSym, decl));
      for (const hp of checker.getPropertiesOfType(thisType)) {
        if (hp.flags & ts.SymbolFlags.Optional) continue;
        if (!out.host.has(hp.name)) out.host.set(hp.name, p.name);
      }
    }
  }
  cache.set(key, out);
  return out;
}
