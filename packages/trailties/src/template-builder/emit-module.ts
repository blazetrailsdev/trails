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
  const explicitValueFroms = new Set(explicit.filter((i) => !i.typeOnly).map((i) => i.from));
  const fromRefs: Import[] = [];
  for (const r of refs) {
    const m = refMeta(r);
    if (m.from && !explicitValueFroms.has(m.from)) {
      fromRefs.push({ from: m.from, named: { [m.name]: m.name } });
    }
  }
  // Auto-collected refs come first so explicit src.imports wins on merge.
  const merged = mergeImports([...fromRefs, ...explicit]);
  const importBlock = merged.map(emitImport).join("\n");
  const pre = src.preamble ? `${src.preamble}\n\n` : "";
  const imp = importBlock ? `${importBlock}\n\n` : "";
  return `${pre}${imp}${declTexts.join("\n\n")}\n`;
}
