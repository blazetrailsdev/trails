/**
 * Transliterates mail's Ragel-generated parsers
 * (`vendor/mail/2.8.1/lib/mail/parsers/*_parser.rb`) into
 * `packages/mail/src/parsers/*.ts` (RFC 0204, "The Ragel parsers are
 * transliterated from their generated Ruby"). Ragel 6 has no JavaScript
 * target, so the generated Ruby is the source: its tables are copied, and its
 * driver loop and action bodies are rewritten line by line by the rules below.
 *
 *   pnpm tsx scripts/mail-parsers/generate.ts           # write
 *   pnpm tsx scripts/mail-parsers/generate.ts --check   # fail on drift
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const __dirname_ = join(new URL(".", import.meta.url).pathname);
const VERSION = "2.8.1";
const ROOT = join(__dirname_, "..", "..");
const SRC = join(ROOT, "vendor", "mail", VERSION, "lib", "mail", "parsers");
const OUT = join(ROOT, "packages", "mail", "src", "parsers");

const camel = (s: string): string =>
  s.replace(/(?<=[a-z0-9])_([a-z0-9])/g, (_, c) => c.toUpperCase());
const kebab = (s: string): string => s.replace(/_/g, "-");

const KEYWORDS = new Set(["nil", "true", "false", "data", "new", "if", "unless"]);

interface Parser {
  kind: string;
  name: string;
  structs: [string, string[]][];
  tables: [string, string[]][];
  scalars: [string, string][];
  body: string[];
}

function read(rb: string): Parser {
  const lines = rb.split("\n");
  const [, kind, name] = /^\s*(module|class) (\w+Parser)$/m.exec(rb)!;
  const structs: [string, string[]][] = [];
  for (const m of rb.matchAll(/^\s*(\w+Struct) = Struct\.new\(([^)]*)\)/gm)) {
    structs.push([m[1], m[2].split(",").map((s) => camel(s.trim().slice(1)))]);
  }
  const tables: [string, string[]][] = [];
  for (const m of rb.matchAll(/^\s*self\.(_\w+) = \[([^\]]*)\]/gm)) {
    tables.push([m[1], m[2].split(/[\s,]+/).filter(Boolean)]);
  }
  const scalars: [string, string][] = [];
  for (const m of rb.matchAll(/^\s*self\.(\w+) = (\d+)$/gm)) scalars.push([m[1], m[2]]);
  const start = lines.findIndex((l) => /^\s*def self\.parse\(data\)$/.test(l));
  const indent = /^\s*/.exec(lines[start])![0];
  const end = lines.findIndex((l, i) => i > start && l === `${indent}end`);
  return { kind, name, structs, tables, scalars, body: lines.slice(start + 1, end) };
}

class Translator {
  readonly locals = new Set<string>();
  readonly elements = new Set<string>();

  constructor(
    private readonly accessors: Set<string>,
    private readonly structs: Set<string>,
  ) {}

  expr(e: string): string {
    const strings: string[] = [];
    const s = e
      .replace(/'([^']*)'|"([^"]*)"/g, (_, a, b) => {
        strings.push(JSON.stringify(a ?? b));
        return `\uE000${strings.length - 1}\uE000`;
      })
      .replace(/Mail::Utilities\.blank\?\(/g, "Utilities.isBlank(")
      .replace(/Mail::Utilities\.unescape\(/g, "Utilities.unescape(")
      .replace(/Mail::Field::(\w+)\.new\(Mail::(\w+)/g, (_, err, el) => {
        this.elements.add(el);
        return `new Field.${err}(\uE001${el}\uE001`;
      })
      .replace(/data\[p\]\.ord/g, "data[p]")
      .replace(/\{(\w+) => (\w+)\}/g, "{ [$1]: $2 }")
      .replace(/(\w+Struct)\.new\(/g, "new $1(")
      .replace(/(\w+Struct)\.new\b/g, "new $1()")
      .replace(/(chars\([^)]*\))\.downcase/g, "($1 as string).toLowerCase()")
      .replace(/(chars\([^)]*\))\.strip/g, "strip($1 as string)")
      .replace(/(chars\([^)]*\))\.rstrip/g, "rstrip($1 as string)")
      .replace(/^([\w.]+) << (.+)$/, (_, a, b) => (a === "cs" ? `${a} << ${b}` : `${a}.push(${b})`))
      .replace(/(?<![.\w\uE001])([a-z_][a-z0-9_]*)\b/g, (_, id: string) => {
        if (id === "nil") return "null";
        if (KEYWORDS.has(id) || id === "strip" || id === "rstrip") return id;
        if (id === "chars") return "self.chars";
        if (this.accessors.has(id)) return `self.${camel(id)}`;
        return camel(id);
      })
      .replace(/\.(\w+)/g, (_, id) => `.${camel(id)}`)
      .replace(/\uE001(\w+)\uE001/g, (_, el) => JSON.stringify(`Mail::${el}`));
    return s.replace(/\uE000(\d+)\uE000/g, (_, i) => strings[Number(i)]);
  }

  cond(c: string): string {
    return c
      .split(/ (&&|\|\|) /)
      .map((part) => {
        if (part === "&&" || part === "||") return part;
        const nil = /^([\w.]+)\.nil\?$/.exec(part);
        if (nil) return `${this.expr(nil[1])} == null`;
        if (/^[\w.]+$/.test(part) && !/^\d+$/.test(part)) return `${this.expr(part)} != null`;
        return this.expr(part);
      })
      .join(" ");
  }

  assign(target: string): void {
    for (const t of target.split(/,\s*/))
      if (/^\w+$/.test(t) && t !== "data") this.locals.add(camel(t));
  }

  statement(s: string): string {
    let m: RegExpExecArray | null;
    if ((m = /^(.*) if (.*)$/.exec(s)) && !s.startsWith("if ")) {
      return `if (${this.cond(m[2])}) ${this.statement(m[1])}`;
    }
    if ((m = /^(.*) unless (.*)$/.exec(s)))
      return `if (!(${this.cond(m[2])})) ${this.statement(m[1])}`;
    if ((m = /^return (.*)$/.exec(s))) return `return ${this.expr(m[1])};`;
    if ((m = /^raise (.*)$/.exec(s))) return `throw ${this.expr(m[1])};`;
    if ((m = /^(\w+) = \$1$/.exec(s))) return `${camel(m[1])} = _m![1];`;
    if ((m = /^([\w, ]+) = nil$/.exec(s)) && s.includes(",")) {
      this.assign(m[1]);
      return `${m[1].split(/,\s*/).map(camel).join(" = ")} = null;`;
    }
    if ((m = /^(\w+) \|\|= (.*)$/.exec(s))) return `${camel(m[1])} ??= ${this.expr(m[2])};`;
    if ((m = /^((?:\w+ = )+)(.*)$/.exec(s))) {
      for (const t of m[1].split(" = ")) this.assign(t.trim());
      const value = / \|\| /.test(m[2])
        ? m[2]
            .split(" || ")
            .map((v) => this.expr(v))
            .join(" ?? ")
        : this.expr(m[2]);
      return `${m[1].split(" = ").filter(Boolean).map(camel).join(" = ")} = ${value};`;
    }
    return `${this.expr(s)};`;
  }
}

function translateBody(p: Parser, t: Translator): string[] {
  const out: string[] = [];
  const stack: ("block" | "case" | "when")[] = [];
  const pad = (): string => "      " + "  ".repeat(stack.length);
  const body = p.body.map((l) => l.trim());
  for (let i = 0; i < body.length; i++) {
    let l = body[i];
    while (l.endsWith(",") && i + 1 < body.length) l += " " + body[++i];
    let m: RegExpExecArray | null;
    if (l === "") continue;
    if (l.startsWith("#")) continue;
    if (l === "begin" || l === "while true") {
      out.push(`${pad()}${l === "begin" ? "{" : "while (true) {"}`);
      stack.push("block");
    } else if ((m = /^_trans = if \((.*)$/.exec(l))) {
      const c = [m[1], body[++i], body[++i]].join(" ").replace(/\)$/, "");
      const a = body[++i];
      i++;
      const b = body[++i];
      i++;
      t.assign("_trans");
      out.push(`${pad()}_trans = ${t.cond(c)} ? ${t.expr(a)} : ${t.expr(b)};`);
    } else if ((m = /^if (.*)$/.exec(l)) && !/ =~ /.test(l)) {
      out.push(`${pad()}if (${t.cond(m[1])}) {`);
      stack.push("block");
    } else if ((m = /^(\w+) = \$1 if (\w+) =~ (\/.*\/)$/.exec(l))) {
      out.push(`${pad()}{`);
      out.push(`${pad()}  const _m = ${m[3]}.exec(${camel(m[2])});`);
      out.push(`${pad()}  if (_m !== null) ${camel(m[1])} = _m![1];`);
      out.push(`${pad()}}`);
    } else if ((m = /^elsif (.*)$/.exec(l))) {
      out.push(`${pad().slice(2)}} else if (${t.cond(m[1])}) {`);
    } else if (l === "else") {
      out.push(`${pad().slice(2)}} else {`);
    } else if ((m = /^case (.*)$/.exec(l))) {
      out.push(`${pad()}switch (${t.expr(m[1])}) {`);
      stack.push("case");
    } else if ((m = /^when (.*)$/.exec(l))) {
      if (stack.at(-1) === "when") {
        out.push(`${pad()}break;`);
        stack.pop();
        out.push(`${pad()}}`);
      }
      out.push(`${pad()}case ${m[1]}: {`);
      stack.push("when");
    } else if (l === "end") {
      if (stack.at(-1) === "when") {
        out.push(`${pad()}break;`);
        stack.pop();
        out.push(`${pad()}}`);
      }
      stack.pop();
      out.push(`${pad()}}`);
    } else if (l === "next") out.push(`${pad()}continue;`);
    else if (l === "break") out.push(`${pad()}break;`);
    else if (/^\w+$/.test(l) && i === body.length - 1) out.push(`${pad()}return ${camel(l)};`);
    else out.push(`${pad()}${t.statement(l)}`);
  }
  return out;
}

const NUMERIC = new Set([
  "p",
  "pe",
  "eof",
  "cs",
  "top",
  "_wide",
  "_gotoLevel",
  "_resume",
  "_eofTrans",
  "_again",
  "_testEof",
  "_out",
]);

function localType(x: string): string {
  if (x === "stack") return "number[]";
  if (x === "testEof") return "boolean";
  if (x === "_acts" || x === "_nacts") return "null";
  if (NUMERIC.has(x)) return "number";
  if (["_slen", "_trans", "_keys", "_inds"].includes(x)) return "any";
  if (/[a-z0-9][SE]$/.test(x)) {
    return "number | null = null";
  }
  return "any";
}

function generate(p: Parser): string {
  const accessors = new Set([...p.tables.map(([n]) => n), ...p.scalars.map(([n]) => n)]);
  const t = new Translator(accessors, new Set(p.structs.map(([n]) => n)));
  const body = translateBody(p, t);
  const used = (name: string): boolean => body.some((l) => new RegExp(`\\b${name}\\(`).test(l));
  const compat = [
    "b",
    "extend",
    ...(used("rstrip") ? ["rstrip"] : []),
    ...(used("strip") ? ["strip"] : []),
    "Struct",
  ];
  const member = (n: string): string => (p.kind === "class" ? `static ${n} = ` : `${n}: `);
  const end = p.kind === "class" ? ";" : ",";
  const out = [
    `/* eslint-disable ${["@typescript-eslint/no-explicit-any", ...(body.some((l) => l.includes("_m!")) ? ["@typescript-eslint/no-unnecessary-type-assertion"] : []), "no-useless-assignment", "prefer-const", "unused-imports/no-unused-vars"].join(", ")} */`,
    `import { ${compat.join(", ")} } from "@blazetrails/ruby-compat";`,
    ...(body.some((l) => l.includes("Field.")) ? [`import { Field } from "../field.js";`] : []),
    `import { ParserTools } from "../parser-tools.js";`,
    ...(body.some((l) => l.includes("Utilities."))
      ? [`import { Utilities } from "../utilities.js";`]
      : []),
    "",
    ...p.structs.map(
      ([n, members]) =>
        `const ${n} = Struct.new(${members.map((x) => JSON.stringify(x)).join(", ")});`,
    ),
    "",
    ...(p.kind === "class"
      ? [`export class ${p.name} {`]
      : [`export const ${p.name} = extend(`, "  {"]),
    ...p.structs.map(([n]) => (p.kind === "class" ? `    static ${n} = ${n};` : `    ${n},`)),
    ...p.tables.map(
      ([n, v]) => `    /** @internal */\n    ${member(camel(n))}[${v.join(", ")}]${end}`,
    ),
    ...p.scalars.map(([n, v]) => `    ${member(camel(n))}${v}${end}`),
    "",
    `    ${p.kind === "class" ? "static " : ""}parse(data: string | Uint8Array | null): any {`,
    `      const self = ${p.name} as any;`,
    `      let ${["p", "pe", "eof", "stack", "cs", "top", ...[...t.locals].filter((x) => !["p", "pe", "eof", "stack", "cs", "top"].includes(x))].map((x) => `${x}: ${localType(x)}`).join(", ")};`,
    "      data = (data == null ? data : b(data)) as Uint8Array;",
    ...body.filter((l) => !/^\s*data = data\.dup/.test(l) && !l.includes("forceEncoding")),
    `    }${p.kind === "class" ? "" : ","}`,
    ...(p.kind === "class"
      ? ["}", "", `extend(${p.name}, ParserTools);`]
      : ["  },", "  ParserTools,", ");"]),
    "",
  ];
  return out.join("\n").replace(/\{\n( *)\}/g, "{\n$1  /** @empty */\n$1}");
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const files = (await readdir(SRC)).filter((f) => f.endsWith("_parser.rb")).sort();
  const drift: string[] = [];
  for (const f of files) {
    const ts = generate(read(await readFile(join(SRC, f), "utf8")));
    const target = join(OUT, `${kebab(f.replace(/\.rb$/, ""))}.ts`);
    const current = await readFile(target, "utf8").catch(() => null);
    if (current === ts) continue;
    if (check) drift.push(target);
    else await writeFile(target, ts);
  }
  const expected = new Set(files.map((f) => `${kebab(f.replace(/\.rb$/, ""))}.ts`));
  for (const f of await readdir(OUT)) {
    if (f.endsWith("-parser.ts") && !expected.has(f)) drift.push(join(OUT, f));
  }
  if (drift.length > 0) {
    console.error(
      `mail parsers drift from vendor/mail/${VERSION}; run pnpm tsx scripts/mail-parsers/generate.ts:`,
    );
    for (const d of drift) console.error(`  ${d}`);
    process.exitCode = 1;
  }
}

void main();
