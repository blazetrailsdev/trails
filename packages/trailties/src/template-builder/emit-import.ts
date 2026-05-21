import type { Import, ImportResult, Ref } from "./types.js";
import { ref } from "./refs.js";

export function tsImport<TNames extends string>(
  from: string,
  names: Record<TNames, string | "named">,
): ImportResult<TNames> {
  const named: Record<string, string | "named"> = { ...names };
  const refs: Record<string, Ref> = {};
  for (const alias of Object.keys(names)) refs[alias] = ref(alias, from);
  return { import: { from, named }, refs: refs as { [K in TNames]: Ref } };
}

export function tsImportDefault<TName extends string>(
  from: string,
  name: TName,
): ImportResult<TName> {
  return {
    import: { from, default: name },
    refs: { [name]: ref(name, from) } as { [K in TName]: Ref },
  };
}

export function tsImportType<TNames extends string>(
  from: string,
  names: Record<TNames, string | "named">,
): ImportResult<TNames> {
  const r = tsImport(from, names);
  r.import.typeOnly = true;
  return r;
}

export function emitImport(imp: Import): string {
  const parts: string[] = [];
  if (imp.default) parts.push(imp.default);
  const keys = imp.named ? Object.keys(imp.named) : [];
  if (keys.length) {
    const entries = keys
      .sort((a, b) => a.localeCompare(b))
      .map((a) => {
        const raw = imp.named![a];
        const o = raw === "named" ? a : raw;
        return a === o ? a : `${o} as ${a}`;
      });
    parts.push(`{ ${entries.join(", ")} }`);
  }
  if (!parts.length) {
    throw new Error(`Import from "${imp.from}" has no default or named bindings`);
  }
  return `${imp.typeOnly ? "import type" : "import"} ${parts.join(", ")} from "${imp.from}";`;
}

function resolveOriginal(alias: string, raw: string | "named"): string {
  return raw === "named" ? alias : raw;
}

export function mergeImports(imports: Import[]): Import[] {
  const map = new Map<string, Import>();
  for (const imp of imports) {
    const key = `${imp.typeOnly ? "t:" : ""}${imp.from}`;
    const e = map.get(key);
    if (!e) {
      map.set(key, {
        from: imp.from,
        typeOnly: imp.typeOnly,
        default: imp.default,
        named: imp.named ? { ...imp.named } : undefined,
      });
      continue;
    }
    if (imp.default) {
      if (e.default && e.default !== imp.default) {
        throw new Error(
          `Conflicting default imports from "${imp.from}": "${e.default}" vs "${imp.default}"`,
        );
      }
      e.default = imp.default;
    }
    if (imp.named) {
      const merged: Record<string, string | "named"> = { ...(e.named ?? {}) };
      for (const alias of Object.keys(imp.named)) {
        const next = imp.named[alias];
        const prev = merged[alias];
        if (prev !== undefined && resolveOriginal(alias, prev) !== resolveOriginal(alias, next)) {
          throw new Error(
            `Conflicting named imports for "${alias}" from "${imp.from}": "${resolveOriginal(alias, prev)}" vs "${resolveOriginal(alias, next)}"`,
          );
        }
        merged[alias] = next;
      }
      e.named = merged;
    }
  }
  // Reconcile value vs type-only entries for the same `from`: any binding
  // present on the value side should be dropped from the type-only side
  // (TS treats the duplicate as conflicting; value subsumes type).
  for (const [key, imp] of map) {
    if (!imp.typeOnly) continue;
    const valueTwin = map.get(imp.from);
    if (!valueTwin) continue;
    if (imp.default && valueTwin.default === imp.default) imp.default = undefined;
    if (imp.named) {
      for (const alias of Object.keys(imp.named)) {
        if (valueTwin.default === alias) delete imp.named[alias];
        else if (valueTwin.named && Object.prototype.hasOwnProperty.call(valueTwin.named, alias)) {
          delete imp.named[alias];
        }
      }
    }
    const namedEmpty = !imp.named || Object.keys(imp.named).length === 0;
    if (!imp.default && namedEmpty) map.delete(key);
  }
  for (const imp of map.values()) {
    if (imp.default && imp.named && Object.prototype.hasOwnProperty.call(imp.named, imp.default)) {
      throw new Error(`Import from "${imp.from}" binds "${imp.default}" as both default and named`);
    }
  }
  return [...map.values()].sort((a, b) => a.from.localeCompare(b.from));
}
