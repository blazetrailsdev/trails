import { Engine, type EngineProperties } from "./erubi.js";

export interface CaptureEndEngineProperties extends EngineProperties {
  escapeCapture?: boolean;
  yieldReturnsBuffer?: boolean;
}

interface CaptureEndState {
  escapeCapture: boolean;
  yieldReturnsBuffer: boolean;
  bufval: string;
  bufstack: string;
}

/** @noRailsEquivalent PERMANENT */
let _pending: CaptureEndState | null = null;

export class CaptureEndEngine extends Engine {
  declare protected escapeCapture: boolean;
  declare protected yieldReturnsBuffer: boolean;
  declare protected bufval: string;
  declare protected bufstack: string;

  constructor(input: string, properties: CaptureEndEngineProperties = {}) {
    properties = { ...properties };
    const escape = Object.hasOwn(properties, "escape")
      ? properties.escape!
      : Object.hasOwn(properties, "escapeHtml")
        ? properties.escapeHtml!
        : false;
    const state: CaptureEndState = {
      escapeCapture: Object.hasOwn(properties, "escapeCapture")
        ? properties.escapeCapture!
        : escape,
      yieldReturnsBuffer: Object.hasOwn(properties, "yieldReturnsBuffer")
        ? properties.yieldReturnsBuffer!
        : false,
      bufval: (properties.bufval ||= "::String.new"),
      bufstack: "__erubi_stack",
    };
    properties.regexp ||= /<%(\|?={1,2}|-|#|%|\|)?(.*?)([-=])?%>([ \t]*\r?\n)?/s;
    _pending = state;
    super(input, properties);
    _pending = null;
    Object.assign(this, state);
    if (new.target === CaptureEndEngine) Object.freeze(this);
  }

  /** @internal */
  protected override handle(
    indicator: string | null,
    code: string | null,
    tailch: string | null,
    rspace: string | null,
    lspace: string | null,
  ): void {
    if (_pending != null) Object.assign(this, _pending);
    switch (indicator) {
      case "|=":
      case "|==": {
        if (tailch != null && tailch !== "") rspace = null;
        if (lspace != null) this.addText(lspace);
        const escapeCapture = !((indicator === "|=") !== this.escapeCapture);
        this.terminateExpression();
        this.src += `begin; (${this.bufstack} ||= []) << ${this.bufvar}; ${this.bufvar} = ${this.bufval}; ${this.bufstack}.last << ${escapeCapture ? this.escapefunc : ""}((${code}`;
        this.bufferOnStack = false;
        if (rspace != null) this.addText(rspace);
        break;
      }
      case "|":
        if (tailch != null && tailch !== "") rspace = null;
        if (lspace != null) this.addText(lspace);
        if (this.yieldReturnsBuffer) {
          this.terminateExpression();
          this.src += ` ${this.bufvar}; `;
        }
        this.src += `${code})).to_s; ensure; ${this.bufvar} = ${this.bufstack}.pop; end;`;
        this.bufferOnStack = false;
        if (rspace != null) this.addText(rspace);
        break;
      default:
        super.handle(indicator, code, tailch, rspace, lspace);
    }
  }
}
