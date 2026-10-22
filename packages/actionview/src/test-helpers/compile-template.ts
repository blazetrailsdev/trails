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
  const tsLines = byLine(mappings);
  const jsLines = byLine(
    decodeLineMappings((JSON.parse(sourceMapText) as { mappings: string }).mappings),
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
              const js = locate(
                jsLines,
                Number(line) - FUNCTION_HEADER_LINES,
                Number(column?.slice(1) ?? 1) - 1,
              );
              const tse = js && locate(tsLines, js.line, js.column);
              return tse ? `${template.identifier}:${tse.line + 1}:${tse.column + 1}` : whole;
            },
          );
        }
        throw error;
      }
    },
  };
}

type Mapping = ReturnType<typeof decodeLineMappings>[number];

function byLine(mappings: readonly Mapping[]): Map<number, Mapping[]> {
  const lines = new Map<number, Mapping[]>();
  for (const m of mappings) lines.set(m.genLine, [...(lines.get(m.genLine) ?? []), m]);
  return lines;
}

function locate(
  lines: Map<number, Mapping[]>,
  line: number,
  column: number,
): { line: number; column: number } | undefined {
  const segments = lines.get(line);
  if (segments === undefined) return undefined;
  const m = segments.filter((c) => (c.genCol ?? 0) <= column).at(-1) ?? segments[0];
  return { line: m.srcLine, column: (m.srcCol ?? 0) + Math.max(0, column - (m.genCol ?? 0)) };
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
