import {
  transpileTse,
  tseHandlerScope,
  virtualizeHandler,
  virtualizeTseWithDeltas,
} from "@blazetrails/trails-tsc/plugins/tse";
import * as ActionView from "@blazetrails/actionview";
import { setTemplateCompiler } from "@blazetrails/actionview/template.js";
import { TSE } from "@blazetrails/actionview/template/handlers/tse.js";
import * as ActiveSupport from "@blazetrails/activesupport";
import { chomp } from "@blazetrails/activesupport";
import * as RubyCompat from "@blazetrails/ruby-compat";

type Template = Parameters<Parameters<typeof setTemplateCompiler>[0]>[0];

const MODULES: Record<string, unknown> = {
  "@blazetrails/actionview": ActionView,
  "@blazetrails/activesupport": ActiveSupport,
  "@blazetrails/ruby-compat": RubyCompat,
};

let compiled = 0;

/**
 * Compiles a `.tse` template from its source at first render. A trails
 * app precompiles its templates with `trails-tsc-views build`; here the
 * source is the one in the editor, so the runtime builds the same stand-in
 * module `build-views` would write (`virtualizeTse` → `transpileModule`) and
 * evaluates it.
 */
export function installTemplateCompiler(): void {
  setTemplateCompiler(async (template: Template, _methodName, source) => {
    const { ts } =
      template.handler instanceof TSE
        ? virtualizeTseWithDeltas(template.handler.stripTrailingNewlines ? chomp(source) : source, {
            view: "any",
            localsSignature: template.strictLocalsBang(),
            ...tseHandlerScope(template),
          })
        : virtualizeHandler(template.handler.call(template, source), source);
    const { outputText } = transpileTse(ts);
    const exports: { default?: never } = {};
    new Function(
      "exports",
      "require",
      `${outputText.replace(/^\/\/# sourceMappingURL=.*$/mu, "")}\n//# sourceURL=${template.identifier}?${++compiled}`,
    )(exports, (id: string) => MODULES[id]);
    return { default: exports.default! };
  });
}
