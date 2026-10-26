import { Dir, File, getFs } from "@blazetrails/ruby-compat";
import { compileJs } from "@blazetrails/tse-compiler";
import ts from "typescript-5";
import { freeIdentifiers, tseLookupTransformer } from "./plugins/tse.js";

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
  const free = freeIdentifiers(render.split("\n")).filter((name) => !IMPORTED.has(name));
  const preamble = [
    "const __own = Object.create(null);",
    'const __lookup = (name, guarded = false) => { for (const scope of [__own, this, globalThis]) if (name in scope) { const value = scope[name]; return scope === this && typeof value === "function" ? value.bind(this) : value; } if (guarded) return undefined; throw new ReferenceError(`${name} is not defined`); };',
    "const __assign = (name, value) => { __own[name] = value; return value; };",
    "const __sink = new Proxy({}, { set: (_target, name, value) => (__assign(name, value), true) });",
    ...free.map((name) => `let ${name} = __lookup(${JSON.stringify(name)});`),
  ].join(" ");
  const body = compileJs(source, { ...options, preamble: free.length === 0 ? "" : preamble }).code;
  const { outputText } = ts.transpileModule(
    [
      'import { StringIO, rbObjAsString } from "@blazetrails/ruby-compat";',
      body.replace(/^export default /u, ""),
      "export default function () {",
      "  this.outputBuffer = new StringIO();",
      "  render.call(this);",
      "  return this.outputBuffer.string();",
      "}",
      "",
    ].join("\n"),
    {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      transformers: { before: [tseLookupTransformer] },
    },
  );
  return outputText;
}
