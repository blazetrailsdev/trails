import { Dir, File, getFs } from "@blazetrails/ruby-compat";
import { compileJs, decodeLineMappings, generateSourceMap } from "@blazetrails/tse-compiler";
import ts from "typescript-5";
import { chainLineMappings } from "./build-views.js";
import { freeIdentifiers, tseLookupTransformer } from "./plugins/tse.js";

const IMPORTED = new Set(["StringIO", "rbObjAsString", "NameError", "rbObjClassname", "TopLevel"]);

/** @noRailsEquivalent PERMANENT */
export async function buildTemplates(paths: readonly string[]): Promise<string[]> {
  const built: string[] = [];
  for (const path of paths) {
    for (const template of await templatesIn(path)) {
      const source = await getFs().readFile(template, "utf8");
      await getFs().writeFile!(`${template}.js`, compileTemplate(source, File.basename(template)));
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

function compileTemplate(source: string, base: string): string {
  const options = {
    trim: true,
    erb: true,
    bufvar: "this.outputBuffer",
    putCmd: "this.outputBuffer.append",
    insertCmd: "((value) => this.outputBuffer.append(rbObjAsString(value)))",
  };
  const render = compileJs(source, options).code.replace(/^export default /u, "");
  const free = freeIdentifiers(render.split("\n")).filter((name) => !IMPORTED.has(name));
  const preamble = [
    "const __own = Object.create(null);",
    "const __lookup = (name, guarded = false) => { for (const scope of [__own, this, TopLevel, globalThis]) if (name in scope) { const value = scope[name]; return scope === this && typeof value === \"function\" ? value.bind(this) : value; } if (guarded) return undefined; throw new NameError(`undefined local variable or method '${name}' for an instance of ${rbObjClassname(this)}`, name, { receiver: this }); };",
    "const __assign = (name, value) => { __own[name] = value; return value; };",
    "const __sink = new Proxy({}, { set: (_target, name, value) => (__assign(name, value), true) });",
    ...free.map((name) => `let ${name} = __lookup(${JSON.stringify(name)});`),
  ].join(" ");
  const compiled = compileJs(source, {
    ...options,
    preamble: free.length === 0 ? "" : preamble,
    fileName: `${base}.js`,
    sourceFileName: base,
  });
  const body = compiled.code;
  const { outputText, sourceMapText } = ts.transpileModule(
    [
      'import { StringIO, rbObjAsString, NameError, rbObjClassname, TopLevel } from "@blazetrails/ruby-compat";',
      body.replace(/^export default /u, ""),
      "export default function () {",
      "  this.outputBuffer = new StringIO();",
      "  render.call(this);",
      "  return this.outputBuffer.string();",
      "}",
      "",
    ].join("\n"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        sourceMap: true,
      },
      fileName: `${base}.ts`,
      transformers: { before: [tseLookupTransformer] },
    },
  );
  const templateMappings = decodeLineMappings(compiled.sourceMap!.mappings).map((m) => ({
    ...m,
    genLine: m.genLine + 1,
  }));
  const mappings = chainLineMappings(
    decodeLineMappings((JSON.parse(sourceMapText!) as { mappings: string }).mappings),
    templateMappings,
  );
  const map = generateSourceMap(`${base}.js`, base, source, mappings);
  const inline = Buffer.from(JSON.stringify(map)).toString("base64");
  return `${outputText.replace(/^\/\/# sourceMappingURL=.*\n?/gmu, "")}//# sourceMappingURL=data:application/json;base64,${inline}\n`;
}
