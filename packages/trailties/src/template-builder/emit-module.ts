import type { Import, ModuleSource, RawDecl, Ref } from "./types.js";

export function tsRaw(text: string): RawDecl {
  return { __kind: "raw", text };
}
import { emitClass } from "./emit-class.js";
import { emitInterface } from "./emit-interface.js";
import { emitImport, mergeImports } from "./emit-import.js";
import { refMeta } from "./refs.js";

export function tsModule(src: ModuleSource): string {
  const refs: Ref[] = [];
  const declTexts: string[] = [];
  for (const d of src.declarations) {
    switch (d.__kind) {
      case "class": {
        const e = emitClass(d);
        refs.push(...e.refs);
        declTexts.push(e.text);
        break;
      }
      case "interface": {
        const e = emitInterface(d);
        refs.push(...e.refs);
        declTexts.push(e.text);
        break;
      }
      case "raw":
        declTexts.push(d.text);
        break;
    }
  }
  const explicit = src.imports ?? [];
  // Per-(from,alias) coverage set built from value-side explicit imports so
  // auto-collection adds new bindings from the same module but does not
  // duplicate (or conflict with) ones the caller has already declared.
  const covered = new Set<string>();
  for (const imp of explicit) {
    if (imp.typeOnly) continue;
    for (const alias of Object.keys(imp.named ?? {})) covered.add(`${imp.from}|${alias}`);
  }
  const fromRefs: Import[] = [];
  for (const r of refs) {
    const m = refMeta(r);
    if (!m.from) continue;
    if (covered.has(`${m.from}|${m.name}`)) continue;
    fromRefs.push({ from: m.from, named: { [m.name]: m.name } });
    covered.add(`${m.from}|${m.name}`);
  }
  const merged = mergeImports([...fromRefs, ...explicit]);
  const importBlock = merged.map(emitImport).join("\n");
  const pre = src.preamble ? `${src.preamble}\n\n` : "";
  const imp = importBlock ? `${importBlock}\n\n` : "";
  return `${pre}${imp}${declTexts.join("\n\n")}\n`;
}
