import {
  decodeLineMappings,
  transpileTse,
  tseHandlerScope,
  virtualizeHandler,
  virtualizeTseWithDeltas,
} from "@blazetrails/trails-tsc";
import { chomp, htmlSafe, TopLevel } from "@blazetrails/activesupport";
import * as RubyCompat from "@blazetrails/ruby-compat";
import { Encoding } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { OutputBuffer } from "../buffers.js";
import { WrongEncodingError } from "../template/error.js";
import { Tse } from "../template/handlers/tse.js";
import type { Template } from "../template.js";

type StandIn = (
  context: unknown,
  locals: Record<string, unknown>,
  block?: (...name: unknown[]) => unknown,
) => unknown;

export async function compileTemplate(
  template: Template,
  source: string,
): Promise<{ default: StandIn }> {
  const { ts, mappings } =
    template.handler instanceof Tse
      ? virtualizeTseWithDeltas(template.handler.stripTrailingNewlines ? chomp(source) : source, {
          view: "any",
          localsSignature: template.strictLocalsBang(),
          ...tseHandlerScope(template, Base.annotateRenderedViewWithFilenames),
        })
      : virtualizeHandler(handlerCode(template, source), source);
  const { outputText, sourceMapText } = transpileTse(ts);
  const tseLine = new Map<number, number>();
  for (const m of mappings) if (!tseLine.has(m.genLine)) tseLine.set(m.genLine, m.srcLine);
  const jsToTse = new Map<number, number>();
  for (const m of decodeLineMappings(
    (JSON.parse(sourceMapText) as { mappings: string }).mappings,
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
            new RegExp(`${url}:(\\d+)(:\\d+)?`, "gu"),
            (whole, line: string, column: string | undefined) => {
              const source = jsToTse.get(Number(line) - FUNCTION_HEADER_LINES);
              return source === undefined
                ? whole
                : `${template.identifier}:${source + 1}${column ?? ""}`;
            },
          );
        }
        throw error;
      }
    },
  };
}

function handlerCode(template: Template, source: string): string {
  const code = template.handler.call(template, source);
  if (/\p{Surrogate}/u.test(code)) throw new WrongEncodingError(code, Encoding.defaultInternal);
  return code;
}

const FUNCTION_HEADER_LINES = new Function("exports", "require", "/*body*/")
  .toString()
  .split("/*body*/")[0]
  .split("\n").length;
let compiled = 0;

const MODULES: Record<string, unknown> = {
  "@blazetrails/actionview": { OutputBuffer, TopLevel },
  "@blazetrails/activesupport": { htmlSafe },
  "@blazetrails/ruby-compat": RubyCompat,
};
