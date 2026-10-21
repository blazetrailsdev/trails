import { API, ModuleKind } from "typescript/unstable/sync";
import { ScriptTarget } from "typescript/unstable/ast";
import { decodeLineMappings, virtualizeTseWithDeltas } from "@blazetrails/trails-tsc";
import { chomp, htmlSafe, TopLevel } from "@blazetrails/activesupport";
import * as RubyCompat from "@blazetrails/ruby-compat";
import { ArgumentError, Encoding, rbEqual } from "@blazetrails/ruby-compat";
import { OutputBuffer } from "../buffers.js";
import { WrongEncodingError } from "../template/error.js";
import { Tse } from "../template/handlers/tse.js";
import type { Template } from "../template.js";

type StandIn = (
  context: unknown,
  locals: Record<string, unknown>,
  block?: (...name: unknown[]) => unknown,
) => unknown;

let api: API | undefined;

export async function compileTemplate(
  template: Template,
  source: string,
): Promise<{ default: StandIn }> {
  if (!(template.handler instanceof Tse)) {
    const code = template.handler.call(template, source);
    if (/\p{Surrogate}/u.test(code)) throw new WrongEncodingError(code, Encoding.defaultInternal);
    const fn = new Function(
      "ArgumentError",
      "htmlSafe",
      "OutputBuffer",
      "TopLevel",
      "RubyCompat",
      `return async function (context, localAssigns, _) { const outputBuffer = context.outputBuffer; with (TopLevel) { with (this) { with (localAssigns) { ${code}\n} } } };`,
    )(ArgumentError, htmlSafe, OutputBuffer, TopLevel, RubyCompat) as StandIn;
    return { default: fn };
  }
  const prepared = template.handler.stripTrailingNewlines ? chomp(source) : source;
  const escapeIgnore = Tse.escapeIgnoreList.some((type) => rbEqual(type, template.type));
  api ??= new API();
  const { ts, mappings } = virtualizeTseWithDeltas(prepared, {
    view: "any",
    escapeIgnore,
    localsSignature: template.strictLocalsBang(),
  });
  const { outputText, sourceMapText } = api.transpileModule(ts, {
    compilerOptions: {
      target: ScriptTarget.Latest,
      module: ModuleKind.CommonJS,
      isolatedModules: true,
      sourceMap: true,
    },
  });
  const tseLine = new Map<number, number>();
  for (const m of mappings) if (!tseLine.has(m.genLine)) tseLine.set(m.genLine, m.srcLine);
  const jsToTse = new Map<number, number>();
  for (const m of decodeLineMappings(
    (JSON.parse(sourceMapText!) as { mappings: string }).mappings,
  )) {
    const line = tseLine.get(m.srcLine);
    if (line !== undefined && !jsToTse.has(m.genLine)) jsToTse.set(m.genLine, line);
  }
  const url = `tse-template-${++compiled}`;
  const exports: { default?: StandIn } = {};
  new Function(
    "exports",
    "require",
    `${outputText.replace(/^\/\/# sourceMappingURL=.*$/mu, "")}\n//# sourceURL=${url}`,
  )(exports, (id: string) => MODULES[id]);
  const render = exports.default!;
  return {
    default: async function (this: unknown, ...args: Parameters<StandIn>) {
      try {
        return await render.apply(this, args);
      } catch (error) {
        if (error instanceof Error && error.stack) {
          error.stack = error.stack.replace(
            new RegExp(`${url}:(\\d+)(?::\\d+)?`, "gu"),
            (whole, line: string) => {
              const source = jsToTse.get(Number(line) - FUNCTION_HEADER_LINES);
              return source === undefined ? whole : `${template.identifier}:${source + 1}`;
            },
          );
        }
        throw error;
      }
    },
  };
}

const FUNCTION_HEADER_LINES = 3;
let compiled = 0;

const MODULES: Record<string, unknown> = {
  "@blazetrails/actionview": { TopLevel },
  "@blazetrails/activesupport": { htmlSafe },
  "@blazetrails/ruby-compat": RubyCompat,
};
