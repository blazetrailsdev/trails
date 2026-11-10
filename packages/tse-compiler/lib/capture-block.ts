import { Engine, type EngineProperties } from "./erubi.js";

export class CaptureBlockEngine extends Engine {
  /** @inventedArm if — PERMANENT */
  constructor(input: string, properties: EngineProperties = {}) {
    properties = { ...properties };
    properties.bufval ??= "::Erubi::CaptureBlockEngine::Buffer.new";
    properties.chainAppends = false;
    super(input, properties);
    if (new.target === CaptureBlockEngine) Object.freeze(this);
  }

  /** @internal */
  protected override addExpressionResult(code: string): void {
    this.addExpressionOp(" <<= ", code);
  }

  /** @internal */
  protected override addExpressionResultEscaped(code: string): void {
    this.addExpressionOp(" |= ", code);
  }

  /** @internal */
  protected addExpressionOp(op: string, code: string): void {
    const check = /^[ \t\r\n\f\v]*$/.test(code) ? "''" : "";
    this.withBuffer(() => {
      this.src += op + check + code;
    });
  }
}
