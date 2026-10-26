import { Dir, File, getFs } from "@blazetrails/ruby-compat";
import { compileJs } from "@blazetrails/tse-compiler";
import { freeIdentifiers } from "./plugins/tse.js";

const IMPORTED = new Set(["StringIO", "rbObjAsString"]);

/** @noRailsEquivalent PERMANENT */
export async function buildTemplates(paths: readonly string[]): Promise<string[]> {
  const built: string[] = [];
  for (const path of paths) {
    for (const template of await templatesIn(path)) {
      const source = await getFs().readFile(template, "utf8");
      await getFs().writeFile!(`${template}.js`, compileTemplate(source));
      built.push(template);
    }
  }
  return built;
}

async function templatesIn(path: string): Promise<string[]> {
  if (!(await getFs().stat!(path)).isDirectory()) return [path];
  const found: string[] = [];
  for (const child of (await Dir.childrenAsync(path)).sort()) {
    const full = File.join(path, child);
    if ((await getFs().stat!(full)).isDirectory()) found.push(...(await templatesIn(full)));
    else if (child.endsWith(".tt")) found.push(full);
  }
  return found;
}

function compileTemplate(source: string): string {
  const options = {
    trim: true,
    bufvar: "this.outputBuffer",
    putCmd: "this.outputBuffer.append",
    insertCmd: "((value) => this.outputBuffer.append(rbObjAsString(value)))",
  };
  const render = compileJs(source, options).code.replace(/^export default /u, "");
  const free = freeIdentifiers(render.split("\n")).filter(
    (name) => !IMPORTED.has(name) && !(name in globalThis),
  );
  const lookups = free.map((name) => `let ${name} = __lookup(${JSON.stringify(name)});`);
  const lookup =
    "const __lookup = (name) => { if (!(name in this)) throw new ReferenceError(`${name} is not defined`); " +
    'const value = this[name]; return typeof value === "function" ? value.bind(this) : value; };';
  const preamble = free.length === 0 ? "" : [lookup, ...lookups].join(" ");
  const body = compileJs(source, { ...options, preamble }).code.replace(/^export default /u, "");
  return [
    'import { StringIO, rbObjAsString } from "@blazetrails/ruby-compat";',
    `const render = ${body};`,
    "export default function () {",
    "  this.outputBuffer = new StringIO();",
    "  render.call(this);",
    "  return this.outputBuffer.string();",
    "}",
    "",
  ].join("\n");
}
