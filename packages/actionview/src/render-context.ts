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

  /**
   * In a layout: return the inner template's rendered output (default yield)
   * or a named `content_for` buffer. Returns an empty SafeBuffer when the
   * named section has no content. Mirrors Rails `<%= yield %>` /
   * `<%= yield :name %>` in layouts.
   */
  yield(section?: string): SafeBuffer;

  /**
   * Capture `callback` output and append it to the named section buffer.
   * Multiple calls with the same name concatenate (Rails behavior).
   * Mirrors Rails `<% content_for(:name) { ... } %>`.
   */
  contentFor(name: string, callback: () => void): void;
}

/**
 * Default implementation of {@link TseRenderContext}.
 */
export class TseRenderContextImpl implements TseRenderContext {
  outputBuffer: OutputBuffer;

  /** Default yield content (inner template output). Set by the renderer before invoking a layout. */
  private _defaultYield: SafeBuffer = htmlSafe("");

  /** Named content_for buffers. Multiple appends concatenate per Rails behavior. */
  private _contentBuffers: Map<string, SafeBuffer> = new Map();

  constructor(outputBuffer: OutputBuffer = new OutputBuffer()) {
    this.outputBuffer = outputBuffer;
  }

  /**
   * Set the default yield content (inner template output).
   * Called by the renderer after rendering the inner template and before invoking the layout.
   * @internal
   */
  setDefaultYield(content: SafeBuffer): void {
    this._defaultYield = content;
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

  yield(section?: string): SafeBuffer {
    if (section === undefined) return this._defaultYield;
    return this._contentBuffers.get(section) ?? htmlSafe("");
  }

  contentFor(name: string, callback: () => void): void {
    const captured = this.capture(callback);
    const existing = this._contentBuffers.get(name);
    this._contentBuffers.set(name, existing ? existing.concat(captured) : captured);
  }
}
