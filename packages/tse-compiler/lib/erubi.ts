import { ArgumentError } from "@blazetrails/ruby-compat";

export const VERSION = "1.13.1";

export const RANGE_FIRST = 0;
export const RANGE_LAST = -1;

export const SKIP_DEFINED_FOR_INSTANCE_VARIABLE = true;
export const FREEZE_TEMPLATE_LITERALS = false;

export const ESCAPE_TABLE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function h(value: unknown): string {
  return (value == null ? "" : String(value)).replace(/[&<>"']/g, (s) => ESCAPE_TABLE[s]);
}

export interface EngineProperties {
  bufval?: string;
  bufvar?: string;
  chainAppends?: boolean;
  ensure?: boolean;
  escapefunc?: string;
  escape?: boolean;
  escapeHtml?: boolean;
  filename?: string;
  freeze?: boolean;
  freezeTemplateLiterals?: boolean;
  literalPrefix?: string;
  literalPostfix?: string;
  outvar?: string;
  postamble?: string;
  preamble?: string;
  regexp?: RegExp;
  src?: string;
  trim?: boolean;
}

export class Engine {
  static DEFAULT_REGEXP = /<%(={1,2}|-|#|%)?(.*?)([-=])?%>([ \t]*\r?\n)?/s;

  src: string;
  readonly filename: string | null;
  readonly bufvar: string;

  protected escape: boolean;
  protected chainAppends: boolean | null;
  protected textEnd: string;
  protected bufferOnStack: boolean;
  protected escapefunc: string;

  /** @inventedArm if — PERMANENT */
  constructor(input: string, properties: EngineProperties = {}) {
    const escape = (this.escape = Object.hasOwn(properties, "escape")
      ? properties.escape!
      : Object.hasOwn(properties, "escapeHtml")
        ? properties.escapeHtml!
        : false);
    const trim = properties.trim !== false;
    this.filename = properties.filename ?? null;
    const bufvar = (this.bufvar = properties.bufvar ?? properties.outvar ?? "_buf");
    const bufval = properties.bufval ?? "::String.new";
    const regexp = properties.regexp ?? Engine.DEFAULT_REGEXP;
    const literalPrefix = properties.literalPrefix ?? "<%";
    const literalPostfix = properties.literalPostfix ?? "%>";
    const preamble = properties.preamble ?? `${bufvar} = ${bufval};`;
    const postamble = properties.postamble ?? `${bufvar}.to_s\n`;
    this.chainAppends = properties.chainAppends ?? null;
    this.textEnd = (
      Object.hasOwn(properties, "freezeTemplateLiterals")
        ? properties.freezeTemplateLiterals
        : FREEZE_TEMPLATE_LITERALS
    )
      ? "'.freeze"
      : "'";

    this.bufferOnStack = false;
    this.src = properties.src ?? "";
    if (properties.freeze) this.src += "# frozen_string_literal: true\n";
    if (properties.ensure) {
      this.src += `begin; __original_outvar = ${bufvar}`;
      if (SKIP_DEFINED_FOR_INSTANCE_VARIABLE && /^@[^@]/.test(bufvar)) {
        this.src += "; ";
      } else {
        this.src += ` if defined?(${bufvar}); `;
      }
    }

    if ((this.escapefunc = properties.escapefunc!) == null) {
      if (escape) {
        this.escapefunc = "__erubi.h";
        this.src += "__erubi = ::Erubi; ";
      } else {
        this.escapefunc = "::Erubi.h";
      }
    }

    this.src += preamble;

    let pos = 0;
    let isBol: string | boolean | null = true;
    const scanner = new RegExp(regexp.source, regexp.flags.replace("g", "") + "g");
    for (const match of input.matchAll(scanner)) {
      const indicator = match[1] ?? null;
      const code = match[2] ?? null;
      const tailch = match[3] ?? null;
      let rspace: string | null = match[4] ?? null;
      const len = match.index - pos;
      let text = input.slice(pos, pos + len);
      pos = match.index + match[0].length;
      const ch = indicator != null ? indicator[RANGE_FIRST] : null;

      let lspace: string | null = null;

      if (ch !== "=") {
        if (text === "") {
          if (isBol) lspace = "";
        } else if (text.at(RANGE_LAST) === "\n") {
          lspace = "";
        } else {
          const rindex = text.lastIndexOf("\n");
          if (rindex !== -1) {
            const s = text.slice(rindex + 1);
            if (/^[ \t]*$/.test(s)) {
              lspace = s;
              text = text.slice(0, rindex + 1);
            }
          } else {
            if (isBol && /^[ \t]*$/.test(text)) {
              lspace = text;
              text = "";
            }
          }
        }
      }

      isBol = rspace;
      this.addText(text);
      switch (ch) {
        case "=":
          if (tailch != null && tailch !== "") rspace = null;
          this.addExpression(indicator, code);
          if (rspace != null) this.addText(rspace);
          break;
        case null:
        case "-":
          if (trim && lspace != null && rspace != null) {
            this.addCode(`${lspace}${code}${rspace}`);
          } else {
            if (lspace != null) this.addText(lspace);
            this.addCode(code);
            if (rspace != null) this.addText(rspace);
          }
          break;
        case "#": {
          const n = (code.match(/\n/g)?.length ?? 0) + (rspace != null ? 1 : 0);
          if (trim && lspace != null && rspace != null) {
            this.addCode("\n".repeat(n));
          } else {
            if (lspace != null) this.addText(lspace);
            this.addCode("\n".repeat(n));
            if (rspace != null) this.addText(rspace);
          }
          break;
        }
        case "%":
          this.addText(
            `${lspace ?? ""}${literalPrefix}${code}${tailch ?? ""}${literalPostfix}${rspace ?? ""}`,
          );
          break;
        default:
          this.handle(indicator, code, tailch, rspace, lspace);
      }
    }
    const rest = pos === 0 ? input : input.slice(pos);
    this.addText(rest);

    if (this.src.at(RANGE_LAST) !== "\n") this.src += "\n";
    this.addPostamble(postamble);
    if (properties.ensure) this.src += "; ensure\n  " + bufvar + " = __original_outvar\nend\n";
    if (new.target === Engine) Object.freeze(this);
  }

  /** @internal */
  protected _dupStringIfFrozen(string: string): string {
    return string;
  }

  /** @internal */
  protected addText(text: string): void {
    if (text === "") return;

    text = this._dupStringIfFrozen(text);
    text = text.replace(/['\\]/g, "\\$&");

    this.withBuffer(() => {
      this.src += " << '" + text + this.textEnd;
    });
  }

  /** @internal */
  protected addCode(code: string): void {
    this.terminateExpression();
    this.src += code;
    if (code.at(RANGE_LAST) !== "\n") this.src += ";";
    this.bufferOnStack = false;
  }

  /** @internal */
  protected addExpression(indicator: string, code: string): void {
    if ((indicator === "=") !== this.escape) {
      this.addExpressionResult(code);
    } else {
      this.addExpressionResultEscaped(code);
    }
  }

  /** @internal */
  protected addExpressionResult(code: string): void {
    this.withBuffer(() => {
      this.src += " << (" + code + ").to_s";
    });
  }

  /** @internal */
  protected addExpressionResultEscaped(code: string): void {
    this.withBuffer(() => {
      this.src += " << " + this.escapefunc + "((" + code + "))";
    });
  }

  /** @internal */
  protected addPostamble(postamble: string): void {
    this.terminateExpression();
    this.src += postamble;
  }

  /** @internal */
  protected handle(
    indicator: string | null,
    _code: string | null,
    _tailch: string | null,
    _rspace: string | null,
    _lspace: string | null,
  ): void {
    throw new ArgumentError(`Invalid indicator: ${indicator}`);
  }

  /** @internal */
  protected withBuffer(block: () => void): void {
    if (this.chainAppends) {
      if (!this.bufferOnStack) {
        this.src += "; " + this.bufvar;
      }
      block();
      this.bufferOnStack = true;
    } else {
      this.src += " " + this.bufvar;
      block();
      this.src += ";";
    }
  }

  /** @internal */
  protected terminateExpression(): void {
    if (this.chainAppends) this.src += "; ";
  }
}
