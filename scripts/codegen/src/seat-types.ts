/**
 * The generated tree's copy of the hand port's `namespaces.ts`, its seat types
 * extended with what the generated files seat on them. A seat is typed by the
 * members its type literal lists (`as AutoloadModule & { Base: typeof Base; … }`);
 * the generator also seats:
 *
 * - a namespace module's functions: `export const ActiveJob = ActiveJobSeat;`
 *   then `Object.assign(ActiveJob, { deprecator, … })`;
 * - constants: `rbModConstSet(ActiveJobSeat, "ConfiguredJob", ConfiguredJob)`;
 * - the state those functions keep on the seat: `ActiveJob._deprecator = …`.
 *
 * Each is added to the seat's type literal, read from its file through an
 * `import type * as` at the top of `namespaces.ts` (the hand file's own form,
 * `import type * as ArgumentsModule from "./arguments.js"`).
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

function walk(d: string): string[] {
  return readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(path.join(d, e.name))
      : e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")
        ? [path.join(d, e.name)]
        : [],
  );
}

export function augmentSeatTypes(srcDir: string): number {
  const nsFile = path.join(srcDir, "namespaces.ts");
  let ns: string;
  try {
    ns = readFileSync(nsFile, "utf8");
  } catch {
    return 0;
  }
  // Seat export name → member name → type text.
  const add = new Map<string, Map<string, string>>();
  const modAlias = new Map<string, string>();
  const imports: string[] = [];
  const moduleOf = (file: string): string => {
    let alias = modAlias.get(file);
    if (alias) return alias;
    const base = path
      .relative(srcDir, file)
      .replace(/\.ts$/, "")
      .replace(/(^|[-/])(\w)/g, (_m, _d, c: string) => c.toUpperCase());
    alias = `${base}Generated`;
    modAlias.set(file, alias);
    let rel = path.relative(srcDir, file).replace(/\.ts$/, ".js");
    if (!rel.startsWith(".")) rel = `./${rel}`;
    imports.push(`import type * as ${alias} from "${rel}";`);
    return alias;
  };
  const member = (seat: string, name: string, type: string) =>
    (add.get(seat) ?? add.set(seat, new Map()).get(seat)!).set(name, type);
  for (const file of walk(srcDir)) {
    if (file === nsFile) continue;
    const text = readFileSync(file, "utf8");
    // `import { ActiveJob as ActiveJobSeat } from "./namespaces.js"`: local → seat.
    const seatLocal = new Map<string, string>();
    for (const m of text.matchAll(/import \{([^}]*)\} from "(?:\.\.?\/)+namespaces\.js";/g))
      for (const part of m[1].split(",")) {
        const [exp, loc] = part.trim().split(/\s+as\s+/);
        if (exp) seatLocal.set((loc ?? exp).trim(), exp.trim());
      }
    if (!seatLocal.size) continue;
    // `export const ActiveJob = ActiveJobSeat;`: the module's own name for it.
    for (const m of text.matchAll(/export const (\w+)(?::[^=]+)? = (\w+);/g))
      if (seatLocal.has(m[2])) seatLocal.set(m[1], seatLocal.get(m[2])!);
    for (const m of text.matchAll(/Object\.assign\((\w+), \{ ([^}]*) \}\);/g)) {
      const seat = seatLocal.get(m[1]);
      if (!seat) continue;
      for (const n of m[2]
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean))
        member(seat, n, `typeof ${moduleOf(file)}.${n}`);
    }
    for (const m of text.matchAll(/rbModConstSet\((\w+), "(\w+)", (\w+)\);/g)) {
      const seat = seatLocal.get(m[1]);
      if (seat && new RegExp(`export (?:class|const|function) ${m[3]}\\b`).test(text))
        member(seat, m[2], `typeof ${moduleOf(file)}.${m[3]}`);
    }
    for (const m of text.matchAll(/\b(\w+)\.(_\w+) =(?!=)/g)) {
      const seat = seatLocal.get(m[1]);
      if (seat) member(seat, m[2], "unknown");
    }
  }
  let n = 0;
  for (const [seat, members] of add) {
    // `export const Seat = { … } as T & { … };`: the last type literal.
    const re = new RegExp(`(export const ${seat} = \\{[^}]*\\} as [^{;]*&\\s*\\{)([^}]*)(\\})`);
    const m = re.exec(ns);
    if (!m) continue;
    const have = new Set([...m[2].matchAll(/^\s*([\w$]+)\??:/gm)].map((x) => x[1]));
    const lines = [...members]
      .filter(([k]) => !have.has(k))
      .map(([k, t]) => `  ${k}${t === "unknown" ? "?" : ""}: ${t};`);
    if (!lines.length) continue;
    n += lines.length;
    ns = ns.replace(
      re,
      (_all, a: string, b: string, c: string) =>
        `${a}${b.replace(/\s*$/, "\n")}${lines.join("\n")}\n${c}`,
    );
  }
  if (imports.length) {
    const lastImport = [...ns.matchAll(/^import [^;]+;$/gm)].at(-1);
    const at = lastImport ? lastImport.index + lastImport[0].length : 0;
    ns = `${ns.slice(0, at)}\n${imports.join("\n")}${ns.slice(at)}`;
  }
  writeFileSync(nsFile, ns);
  return n;
}
