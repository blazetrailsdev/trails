import {
  chainLineMappings,
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
import { TSE } from "../template/handlers/tse.js";
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
    template.handler instanceof TSE
      ? virtualizeTseWithDeltas(template.handler.stripTrailingNewlines ? chomp(source) : source, {
          view: "any",
          localsSignature: template.strictLocalsBang(),
          ...tseHandlerScope(template, Base.annotateRenderedViewWithFilenames),
        })
      : virtualizeHandler(handlerCode(template, source), source);
  const { outputText, sourceMapText } = transpileTse(ts);
  const chained = chainLineMappings(
    decodeLineMappings((JSON.parse(sourceMapText) as { mappings: string }).mappings),
    mappings,
  );
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
              const jsLine = Number(line) - FUNCTION_HEADER_LINES;
              const jsColumn = Number(column?.slice(1) ?? 1) - 1;
              const m = chained
                .filter((c) => c.genLine === jsLine && (c.genCol ?? 0) <= jsColumn)
                .at(-1);
              if (m === undefined) return whole;
              const tseColumn = (m.srcCol ?? 0) + jsColumn - (m.genCol ?? 0);
              return `${template.identifier}:${m.srcLine + 1}:${tseColumn + 1}`;
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
