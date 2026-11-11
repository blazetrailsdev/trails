import { rbObjDup, toS } from "@blazetrails/ruby-compat";
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

  capture<A extends unknown[]>(...args: [...A, (...args: A) => void]): Buffer {
    const block = args.pop() as (...args: A) => void;
    const prev = rbObjDup(this);
    try {
      this.value = "";
      block(...(args as unknown as A));
      return rbObjDup(this);
    } finally {
      this.value = prev.value;
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
