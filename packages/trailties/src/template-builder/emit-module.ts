import type { Import, ModuleSource, RawDecl, Ref } from "./types.js";
import { emitClass } from "./emit-class.js";
import { emitInterface } from "./emit-interface.js";
import { emitImport, mergeImports } from "./emit-import.js";
import { refMeta } from "./refs.js";

export function tsRaw(text: string): RawDecl {
  return { __kind: "raw", text };
}

export function tsModule(src: ModuleSource): string {
  const valueRefs: Ref[] = [];
  const typeRefs: Ref[] = [];
  const declTexts: string[] = [];
  for (const d of src.declarations) {
    switch (d.__kind) {
      case "class": {
        const e = emitClass(d);
        valueRefs.push(...e.valueRefs);
        typeRefs.push(...e.typeRefs);
        declTexts.push(e.text);
        break;
      }
      case "interface": {
        const e = emitInterface(d);
        valueRefs.push(...e.valueRefs);
        typeRefs.push(...e.typeRefs);
        declTexts.push(e.text);
        break;
      }
      case "raw":
        declTexts.push(d.text);
        break;
    }
  }
  // Aliases used in value position, grouped by source module — feeds the
  // type-only → value promotion pass below.
  const valueAliasesByFrom = new Map<string, Set<string>>();
  for (const r of valueRefs) {
    const m = refMeta(r);
    if (!m.from) continue;
    let s = valueAliasesByFrom.get(m.from);
    if (!s) {
      s = new Set();
      valueAliasesByFrom.set(m.from, s);
    }
    s.add(m.name);
  }
  // Clone explicit imports; for any type-only entry whose binding is used
  // as a value, split that binding out into a sibling value Import that
  // preserves the original (renamed) mapping.
  const explicit: Import[] = [];
  const promoted: Import[] = [];
  for (const imp of src.imports ?? []) {
    const cloned: Import = {
      from: imp.from,
      typeOnly: imp.typeOnly,
      default: imp.default,
      named: imp.named ? { ...imp.named } : undefined,
    };
    if (!cloned.typeOnly) {
      explicit.push(cloned);
      continue;
    }
    const valueUses = valueAliasesByFrom.get(cloned.from);
    if (!valueUses) {
      explicit.push(cloned);
      continue;
    }
    const valueSide: Import = { from: cloned.from };
    if (cloned.default && valueUses.has(cloned.default)) {
      valueSide.default = cloned.default;
      cloned.default = undefined;
    }
    if (cloned.named) {
      for (const alias of Object.keys(cloned.named)) {
        if (!valueUses.has(alias)) continue;
        valueSide.named = { ...(valueSide.named ?? {}), [alias]: cloned.named[alias] };
        delete cloned.named[alias];
      }
    }
    if (valueSide.default || valueSide.named) promoted.push(valueSide);
    const stillHasType = cloned.default || (cloned.named && Object.keys(cloned.named).length);
    if (stillHasType) explicit.push(cloned);
  }
  // Coverage from final (post-promotion) explicit + promoted entries.
  const valueCovered = new Set<string>();
  const typeCovered = new Set<string>();
  for (const imp of [...explicit, ...promoted]) {
    const set = imp.typeOnly ? typeCovered : valueCovered;
    if (imp.default) set.add(`${imp.from}|${imp.default}`);
    for (const alias of Object.keys(imp.named ?? {})) set.add(`${imp.from}|${alias}`);
  }
  // Auto-collect: value refs → value imports; type refs → type imports,
  // but only when the binding isn't covered or used as a value elsewhere.
  const fromRefs: Import[] = [];
  const usedAsValue = new Set<string>();
  for (const r of valueRefs) {
    const m = refMeta(r);
    if (!m.from) continue;
    const key = `${m.from}|${m.name}`;
    usedAsValue.add(key);
    if (valueCovered.has(key)) continue;
    fromRefs.push({ from: m.from, named: { [m.name]: m.name } });
    valueCovered.add(key);
  }
  for (const r of typeRefs) {
    const m = refMeta(r);
    if (!m.from) continue;
    const key = `${m.from}|${m.name}`;
    if (usedAsValue.has(key)) continue;
    if (valueCovered.has(key) || typeCovered.has(key)) continue;
    fromRefs.push({ from: m.from, typeOnly: true, named: { [m.name]: m.name } });
    typeCovered.add(key);
  }
  const merged = mergeImports([...fromRefs, ...explicit, ...promoted]);
  const importBlock = merged.map(emitImport).join("\n");
  const pre = src.preamble ? `${src.preamble}\n\n` : "";
  const imp = importBlock ? `${importBlock}\n\n` : "";
  return `${pre}${imp}${declTexts.join("\n\n")}\n`;
}
