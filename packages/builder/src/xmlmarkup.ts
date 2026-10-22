import { isSymbol, rbBlockGivenP, rbObjAsString, symbolToS } from "@blazetrails/ruby-compat";
import { IllegalBlockError, type Target, XmlBase } from "./xmlbase.js";

function lshift(target: Target, text: string): Target {
  if (typeof target === "string") return target + text;
  target.append(text);
  return target;
}

export interface XmlMarkupOptions {
  indent?: number | false | null;
  margin?: number | false | null;
  quote?: ":single" | ":double" | null;
  explicitNilHandling?: unknown;
  target?: Target | false | null;
}

export class XmlMarkup extends XmlBase {
  declare protected _quote: string;

  constructor(options: XmlMarkupOptions = {}) {
    const indent = options.indent != null && options.indent !== false ? options.indent : 0;
    const margin = options.margin != null && options.margin !== false ? options.margin : 0;
    super(indent, margin);
    this._quote = options.quote === ":single" ? "'" : '"';
    this._explicitNilHandling = options.explicitNilHandling;
    this._target = options.target != null && options.target !== false ? options.target : "";
  }

  targetBang(): Target {
    return this._target;
  }

  commentBang(commentText: unknown, block?: unknown): void {
    this._ensureNoBlock(rbBlockGivenP(block));
    this._special("<!-- ", " -->", commentText, null);
  }

  declareBang(inst: string, ...args: unknown[]): void {
    const block = rbBlockGivenP(args.at(-1)) ? (args.pop() as (xml: XmlBase) => unknown) : null;
    this._indent();
    this._target = lshift(this._target, `<!${isSymbol(inst) ? symbolToS(inst) : inst}`);
    for (const arg of args) {
      if (isSymbol(arg)) {
        this._target = lshift(this._target, ` ${symbolToS(arg)}`);
      } else if (typeof arg === "string") {
        this._target = lshift(this._target, ` "${arg}"`);
      }
    }
    if (block) {
      this._target = lshift(this._target, " [");
      this._newline();
      this._nestedStructures(block);
      this._target = lshift(this._target, "]");
    }
    this._target = lshift(this._target, ">");
    this._newline();
  }

  instructBang(
    directiveTag: string = ":xml",
    attrs: Record<string, unknown> = {},
    block?: unknown,
  ): void {
    this._ensureNoBlock(rbBlockGivenP(block));
    if (directiveTag === ":xml") {
      const a = { version: "1.0", encoding: "UTF-8" };
      attrs = { ...a, ...attrs };
      this._encoding = String(attrs.encoding).toLowerCase();
    }
    this._special(
      `<?${isSymbol(directiveTag) ? symbolToS(directiveTag) : directiveTag}`,
      "?>",
      null,
      attrs,
      ["version", "encoding", "standalone"],
    );
  }

  cdataBang(text: string, block?: unknown): void {
    this._ensureNoBlock(rbBlockGivenP(block));
    this._special("<![CDATA[", "]]>", text.replaceAll("]]>", "]]]]><![CDATA[>"), null);
  }

  cdataValueBang(open: string, text: string, block?: unknown): void {
    this._ensureNoBlock(rbBlockGivenP(block));
    this._special(
      `<${open}>`,
      `</${open}>`,
      `<![CDATA[${text.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`,
      null,
    );
  }

  /** @internal */
  protected _text(text: string): void {
    this._target = lshift(this._target, text);
  }

  /** @internal */
  private _special(
    open: string,
    close: string,
    data: unknown = null,
    attrs: Record<string, unknown> | null = null,
    order: string[] = [],
  ): void {
    this._indent();
    this._target = lshift(this._target, open);
    if (data != null && data !== false)
      this._target = lshift(this._target, isSymbol(data) ? symbolToS(data) : rbObjAsString(data));
    if (attrs) this._insertAttributes(attrs, order);
    this._target = lshift(this._target, close);
    this._newline();
  }

  /** @internal */
  protected _startTag(sym: string, attrs: Record<string, unknown> | null, endToo = false): void {
    this._target = lshift(this._target, `<${symbolToS(sym)}`);
    this._insertAttributes(attrs);
    if (endToo) this._target = lshift(this._target, "/");
    this._target = lshift(this._target, ">");
  }

  /** @internal */
  protected _endTag(sym: string): void {
    this._target = lshift(this._target, `</${symbolToS(sym)}>`);
  }

  /** @internal */
  private _insertAttributes(attrs: Record<string, unknown> | null, order: string[] = []): void {
    if (attrs == null) return;
    for (const k of order) {
      const v = attrs[k];
      if (v != null && v !== false)
        this._target = lshift(
          this._target,
          ` ${k}=${this._quote}${this._attrValue(v)}${this._quote}`,
        );
    }
    for (const [k, v] of Object.entries(attrs)) {
      if (!order.includes(k))
        this._target = lshift(
          this._target,
          ` ${k}=${this._quote}${this._attrValue(v)}${this._quote}`,
        );
    }
  }

  /** @internal */
  private _attrValue(value: unknown): string {
    return isSymbol(value) ? symbolToS(value) : this._escapeAttribute(rbObjAsString(value));
  }

  /** @internal */
  private _ensureNoBlock(gotBlock: boolean): void {
    if (gotBlock) throw new IllegalBlockError("Blocks are not allowed on XML instructions");
  }
}
