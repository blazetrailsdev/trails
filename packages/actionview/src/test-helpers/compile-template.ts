import { API, ModuleKind } from "typescript/unstable/sync";
import { ScriptTarget } from "typescript/unstable/ast";
import { virtualizeTse } from "@blazetrails/trails-tsc";
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
  const { outputText } = api.transpileModule(
    virtualizeTse(prepared, {
      view: "any",
      escapeIgnore,
      localsSignature: template.strictLocalsBang(),
    }),
    {
      compilerOptions: {
        target: ScriptTarget.Latest,
        module: ModuleKind.CommonJS,
        isolatedModules: true,
      },
    },
  );
  const exports: { default?: StandIn } = {};
  new Function("exports", "require", outputText)(exports, (id: string) => MODULES[id]);
  return { default: exports.default! };
}

const MODULES: Record<string, unknown> = {
  "@blazetrails/actionview": { TopLevel },
  "@blazetrails/activesupport": { htmlSafe },
  "@blazetrails/ruby-compat": RubyCompat,
};
