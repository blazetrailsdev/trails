import { SafeBuffer, htmlSafe } from "@blazetrails/activesupport";
import { OutputBuffer } from "./buffers.js";

/**
 * Per-render execution context passed to compiled `.tse` templates.
 *
 * Mirrors the subset of ActionView::Base that ERB templates interact with for
 * output capture (`with_output_buffer`), direct concatenation, and raw output.
 * See `actionview/lib/action_view/helpers/capture_helper.rb` and
 * `output_safety_helper.rb`.
 */
export interface TseRenderContext {
  /** Currently-active output buffer. Swapped by {@link capture}. */
  outputBuffer: OutputBuffer;

  /**
   * Redirect output to a fresh buffer for the duration of `callback`, then
   * restore the previous buffer and return captured content as a SafeBuffer.
   * Mirrors Rails `capture` (implemented via `with_output_buffer` semantics).
   */
  capture(callback: () => void): SafeBuffer;

  /**
   * Append `value` to the currently-active buffer, escaping unless html-safe.
   * Mirrors Rails `concat`.
   */
  concat(value: unknown): void;

  /**
   * Mark `value` as HTML-safe without escaping. Mirrors Rails `raw`.
   */
  raw(value: unknown): SafeBuffer;
}

/**
 * Default implementation of {@link TseRenderContext}.
 */
export class TseRenderContextImpl implements TseRenderContext {
  outputBuffer: OutputBuffer;

  constructor(outputBuffer: OutputBuffer = new OutputBuffer()) {
    this.outputBuffer = outputBuffer;
  }

  capture(callback: () => void): SafeBuffer {
    const previous = this.outputBuffer;
    this.outputBuffer = new OutputBuffer();
    try {
      callback();
      return this.outputBuffer.toString();
    } finally {
      this.outputBuffer = previous;
    }
  }

  concat(value: unknown): void {
    this.outputBuffer.append(value);
  }

  raw(value: unknown): SafeBuffer {
    // OutputBuffer.toString() returns a non-primitive SafeBuffer, breaking String() coercion.
    if (value instanceof OutputBuffer) return value.toString();
    if (value instanceof SafeBuffer) return value;
    return htmlSafe(String(value ?? ""));
  }
}
