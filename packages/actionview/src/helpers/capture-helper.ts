import { SafeBuffer, htmlEscape, isPresent } from "@blazetrails/activesupport";

import { OutputBuffer } from "../buffers.js";
import { OutputFlow } from "../flows.js";

/**
 * Host shape required by capture-helper. Mixed into ActionView::Base
 * (and ActionView::TestCase) via `this`-typed function assignment.
 */
export interface CaptureHelperHost {
  outputBuffer: OutputBuffer | null;
  viewFlow: OutputFlow;
}

/**
 * capture — runs `block`, returning what it appended to the output buffer
 * as an HTML-safe string. If the block's return value is itself a string
 * (and the buffer stayed empty), that value is HTML-escaped and returned.
 * Mirrors `ActionView::Helpers::CaptureHelper#capture`.
 */
export function capture<TArgs extends unknown[]>(
  this: CaptureHelperHost,
  block: (...args: TArgs) => unknown,
  ...args: TArgs
): SafeBuffer | null {
  let value: unknown = null;
  if (!this.outputBuffer) this.outputBuffer = new OutputBuffer();
  const buf = this.outputBuffer;
  const buffer = buf.capture(() => {
    value = block(...args);
  });

  let string: unknown;
  if (buf === value) {
    string = buffer;
  } else {
    string = isPresent(buffer.toString()) ? buffer : value;
  }

  if (string instanceof OutputBuffer) return string.toString();
  if (string instanceof SafeBuffer) return string;
  if (typeof string === "string") return htmlEscape(string);
  return null;
}

/**
 * contentFor — stores or retrieves a block of markup keyed by `name`.
 * With `content` or a block: appends (or replaces, when `flush: true`)
 * into the view flow and returns `null`. Without either: returns the
 * stored content if any, else `null`. Mirrors
 * `ActionView::Helpers::CaptureHelper#content_for`.
 */
export function contentFor(
  this: CaptureHelperHost,
  name: string,
  content?: unknown,
  options?: { flush?: boolean },
  block?: () => unknown,
): SafeBuffer | null {
  if (content != null || block) {
    let opts = options;
    let body: unknown = content;
    if (block) {
      if (options === undefined && isPlainOptions(content)) {
        opts = content;
      }
      body = capture.call(this, block);
    }
    if (body !== undefined && body !== null) {
      if (opts?.flush) {
        this.viewFlow.set(name, body);
      } else {
        this.viewFlow.append(name, body);
      }
    }
    return null;
  }
  const stored = this.viewFlow.get(name);
  return isPresent(stored.toString()) ? stored : null;
}

/** Mirrors Ruby's `Hash === value` for the options-vs-content disambiguation. */
function isPlainOptions(value: unknown): value is { flush?: boolean } {
  return (
    typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * provide — like `contentFor`, but for streaming responses flushes back
 * to the layout immediately. Mirrors
 * `ActionView::Helpers::CaptureHelper#provide`.
 */
export function provide(
  this: CaptureHelperHost,
  name: string,
  content?: unknown,
  block?: () => unknown,
): SafeBuffer | null {
  let body: unknown = content;
  if (block) body = capture.call(this, block);
  if (body !== undefined && body !== null) {
    this.viewFlow.appendBang(name, body);
    return null;
  }
  return null;
}

/**
 * contentForQuestion — `content_for?(name)`. True if any content has been
 * captured for `name`. Mirrors `CaptureHelper#content_for?`.
 */
export function contentForQuestion(this: CaptureHelperHost, name: string): boolean {
  return isPresent(this.viewFlow.get(name).toString());
}

/**
 * withOutputBuffer — swaps the output buffer for the duration of `block`,
 * returning the swapped-in buffer. Mirrors `CaptureHelper#with_output_buffer`.
 *
 * @internal
 */
export function withOutputBuffer(
  this: CaptureHelperHost,
  buf: OutputBuffer | null,
  block: () => void,
): OutputBuffer {
  const next = buf ?? new OutputBuffer();
  const old = this.outputBuffer;
  this.outputBuffer = next;
  try {
    block();
    return next;
  } finally {
    this.outputBuffer = old;
  }
}
