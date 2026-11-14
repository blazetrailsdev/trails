/**
 * Generates the TS definition modules `TZInfo::DataSources::RubyDataSource`
 * loads from a tzinfo-data Format 2 tree (`<src>/tzinfo/data/**.rb`), one TS
 * module per Ruby file, plus `load-path.ts`, the `TZInfo.loadPath` table
 * `RubyDataSource.load` awaits. Each module opens its Ruby modules on the
 * `TZInfo` namespace and makes the same definer calls, in the same order.
 *
 * Run with `pnpm tsx scripts/generate-tzinfo-data.ts <src> <out> <location>`;
 * `<location>` is `TZInfo::Data::LOCATION`, the root of the load-path keys.
 * The checked-in fixtures are
 * `vendor/tzinfo/v2.0.6/test/tzinfo-data2` → `packages/tzinfo/test/tzinfo-data2`
 * (location `tzinfo-data2`), formatted with prettier after generation.
 */
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const MIXINS: Record<string, string> = {
  "Format2::TimezoneDefinition": "TimezoneDefinition",
  "Format2::TimezoneIndexDefinition": "TimezoneIndexDefinition",
  "Format2::CountryIndexDefinition": "CountryIndexDefinition",
};

function rubyString(literal: string): string {
  return JSON.stringify(literal.slice(1, -1).replace(/\\(.)/g, "$1"));
}

function translateArgs(args: string): string {
  const tokens = args.match(/'(?:[^'\\]|\\.)*'|:\w+|-?\d+/g) ?? [];
  return tokens
    .map((t) => (t.startsWith("'") ? rubyString(t) : t.startsWith(":") ? `"${t.slice(1)}"` : t))
    .join(", ");
}

function camelize(name: string): string {
  return name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Translates one tzinfo-data Ruby file into its TS module. */
export function translate(source: string): string {
  const out: string[] = [];
  const modules: string[] = [];
  const blocks: ("module" | "block")[] = [];
  let mixin: string | null = null;
  const indent = () => "  ".repeat(blocks.filter((b) => b === "block").length);

  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (line === "" || /^# (encoding|frozen_string_literal):/.test(line)) continue;
    let m: RegExpMatchArray | null;
    if (line.startsWith("#")) {
      continue;
    } else if ((m = line.match(/^module (\w+)$/))) {
      const name = m[1];
      const parent = modules.at(-1);
      out.push(
        parent === undefined
          ? `const ${name} = TopLevel.${name}! as NonNullable<typeof TopLevel.${name}> & Namespace;`
          : `const ${name} = (${parent}.${name} ??= {}) as Namespace;`,
      );
      modules.push(name);
      blocks.push("module");
    } else if ((m = line.match(/^include (\S+)$/))) {
      mixin = MIXINS[m[1]];
      if (mixin === undefined) throw new Error(`unknown mixin ${m[1]}`);
      out.push(`include(${modules.at(-1)}, TZInfo.Format2.${mixin});`);
    } else if ((m = line.match(/^([A-Z]\w*) = (.+)$/))) {
      const value = m[2].startsWith("'")
        ? rubyString(m[2])
        : /^\d+$/.test(m[2])
          ? m[2]
          : `${[...modules].reverse().find((mod) => out.some((l) => l.startsWith(`${mod}.${m![2]} =`)))}.${m[2]}`;
      out.push(`${modules.at(-1)}.${m[1]} = ${value};`);
    } else if (line === "end") {
      if (blocks.pop() === "block") out.push(`${indent()}});`);
      else modules.pop();
    } else if ((m = line.match(/^(?:(\w+)\.)?(\w+)(?: (?!do \|)(.*?))?(?: do \|(\w+)\|)?$/))) {
      const [, recv, meth, args = "", param] = m;
      const target =
        recv ?? `(${modules.at(-1)} as unknown as Extended<Format2["${mixin}"]["ClassMethods"]>)`;
      const call = `${indent()}${target}.${camelize(meth)}(${translateArgs(args)}`;
      if (param !== undefined) {
        out.push(`${call}${args ? ", " : ""}(${param}) => {`);
        blocks.push("block");
      } else {
        out.push(`${call});`);
      }
    } else {
      throw new Error(`cannot translate: ${line}`);
    }
  }
  const uses = out.join("\n");
  const imports = ["TopLevel", ...(uses.includes("include(") ? ["include"] : [])];
  if (uses.includes("Extended<")) imports.push("type Extended");
  return [
    `import { ${imports.join(", ")} } from "@blazetrails/ruby-compat";`,
    "",
    "type Namespace = { [name: string]: unknown };",
    ...(uses.includes("Extended<")
      ? ['type Format2 = NonNullable<typeof TopLevel.TZInfo>["Format2"];']
      : []),
    "",
    ...out,
    "",
  ].join("\n");
}

async function rubyFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".rb"))
    .map((e) => join(e.parentPath, e.name))
    .sort();
}

/** Writes every module under `out`, answering the paths written. */
export async function generate(src: string, out: string, location: string): Promise<string[]> {
  const dataDir = join(src, "tzinfo", "data");
  await rm(out, { recursive: true, force: true });
  const written: string[] = [];
  const loadPath: string[] = [`  "tzinfo/data": () => import("./tzinfo/data.js"),`];
  for (const file of await rubyFiles(dataDir)) {
    const rel = relative(src, file).replace(/\.rb$/, "");
    const target = join(out, `${rel}.ts`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, translate(await readFile(file, "utf8")));
    written.push(target);
    if (!rel.startsWith("tzinfo/data/version")) {
      loadPath.push(`  ${JSON.stringify(`${location}/${rel}`)}: () => import("./${rel}.js"),`);
    }
  }
  const data = join(out, "tzinfo", "data.ts");
  await writeFile(
    data,
    [
      'import { TopLevel } from "@blazetrails/ruby-compat";',
      'import "./data/version.js";',
      "",
      "type Namespace = { [name: string]: unknown };",
      "",
      "const TZInfo = TopLevel.TZInfo! as NonNullable<typeof TopLevel.TZInfo> & Namespace;",
      "const Data = (TZInfo.Data ??= {}) as Namespace;",
      `Data.LOCATION = ${JSON.stringify(location)};`,
      "",
    ].join("\n"),
  );
  written.push(data);
  const loadPathFile = join(out, "load-path.ts");
  await writeFile(
    loadPathFile,
    `export const loadPath: Record<string, () => Promise<unknown>> = {\n${loadPath.join("\n")}\n};\n`,
  );
  written.push(loadPathFile);
  return written.sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [src, out, location] = process.argv.slice(2);
  if (!src || !out || !location) {
    console.error("usage: generate-tzinfo-data.ts <src> <out> <location>");
    process.exit(1);
  }
  await generate(src, out, location);
}
