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
  const signature = template.strictLocalsBang();
  const comment = `<%# locals: (${signature === "**nil" ? "" : signature}) %>`;
  const restored =
    signature == null || /#\s+locals:\s+\(/u.test(prepared)
      ? prepared
      : /<%(\s*-?%>)/u.test(prepared)
        ? prepared.replace(
            /<%(\s*-?%>)/u,
            `<%# locals: (${signature === "**nil" ? "" : signature})$1`,
          )
        : `${comment}${prepared}`;
  const escapeIgnore = Tse.escapeIgnoreList.some((type) => rbEqual(type, template.type));
  api ??= new API();
  const { outputText } = api.transpileModule(
    virtualizeTse(restored, { view: "any", escapeIgnore }),
    {
      compilerOptions: {
        target: ScriptTarget.Latest,
        module: ModuleKind.ESNext,
        isolatedModules: true,
      },
    },
  );
  const body = outputText
    .replace(/^import\s[^;]*;$/gmu, "")
    .replace(/^export default async function render\(/mu, "return async function render(");
  const standIn = new Function("TopLevel", "htmlSafe", "RubyCompat", "ArgumentError", body)(
    TopLevel,
    htmlSafe,
    RubyCompat,
    ArgumentError,
  ) as StandIn;
  return { default: standIn };
}
