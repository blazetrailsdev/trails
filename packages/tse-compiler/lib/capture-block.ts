import { LocalJumpError, rbBlockGivenP, rbObjDup, toS } from "@blazetrails/ruby-compat";
import { Engine, h, type EngineProperties } from "./erubi.js";

export class Buffer {
  /** @noRailsEquivalent PERMANENT */
  protected value = "";

  append(v: unknown): this {
    this.value += toS(v);
    return this;
  }

  bitwiseOr(v: unknown): this {
    this.value += this.h(v);
    return this;
  }

  capture(...args: unknown[]): Buffer {
    const block = rbBlockGivenP(args.at(-1)) ? (args.pop() as (...args: unknown[]) => void) : null;
    let prev: Buffer | undefined;
    try {
      prev = rbObjDup(this);
      this.value = "";
      if (block === null) throw new LocalJumpError("no block given (yield)");
      block(...args);
      return rbObjDup(this);
    } finally {
      this.value = prev!.value;
    }
  }

  /** @noRailsEquivalent PERMANENT */
  toString(): string {
    return this.value;
  }

  /** @internal */
  private h(v: unknown): string {
    return h(v);
  }
}

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
